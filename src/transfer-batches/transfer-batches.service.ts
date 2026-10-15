/**
 * TransferBatchesService
 * --------------------
 * Transferência de peças em lote entre estoques (Central ↔ revendedoras).
 *
 * Mesmo padrão das importações (PurchaseImport/CustomerImport): `preview`
 * lê a planilha e não grava nada; `create` recebe só as peças válidas, já
 * revisadas na tela, e chama fn_transfer_stock_batch — uma transação só,
 * então se o estoque de uma peça mudou desde a prévia nada é transferido.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import type { Database } from '../types/supabase';
import type { AuthUser } from '../auth/types/auth-user.type';
import { fetchAllPages } from '../common/utils/fetch-all-pages.util';
import { extractInsufficientStockMessage } from '../common/utils/stock-error.util';
import {
  CreateTransferBatchDto,
  ListTransferBatchesDto,
  parseLocation,
} from './dto/transfer-batch.dto';
import {
  TransferBatchDetail,
  TransferBatchDetailItem,
  TransferBatchErrorRow,
  TransferBatchItemPreview,
  TransferBatchPreviewResponse,
  TransferBatchSummary,
} from './transfer-batches.types';

/** Célula crua de planilha: o que o `xlsx` pode devolver por célula. */
type SheetCell = string | number | boolean | Date | undefined;

/** Códigos/ids por consulta (limita o tamanho da URL). */
const LOOKUP_CHUNK = 150;

/** Teto de linhas por planilha (uma mala tem bem menos que isso). */
const MAX_ROWS = 5000;

const INVALID_LOCATION_MESSAGE =
  'Local de estoque inválido: escolha o Estoque Lumilee ou uma revendedora ativa.';

interface ParsedRow {
  row_number: number;
  code: string;
  quantity: number;
}

interface CodeGroup {
  code: string;
  quantity: number;
  row_numbers: number[];
}

interface ProductRef {
  id: number;
  sku: string | null;
  sku2: string | null;
  name: string;
  price: number;
}

interface UserRoleRow {
  id: number;
  is_active: boolean | null;
  roles: { name: string } | { name: string }[] | null;
}

interface LocationWithProductRow {
  product_id: number;
  quantity: number;
  products: ProductRef | ProductRef[] | null;
}

interface BatchRow {
  id: number;
  from_user_id: number | null;
  to_user_id: number | null;
  notes: string | null;
  total_items: number;
  total_quantity: number;
  created_at: string;
  from_user: { name: string } | null;
  to_user: { name: string } | null;
  creator: { name: string } | null;
}

interface TransferItemRow {
  id: number;
  product_id: number;
  quantity: number;
  products: ProductRef | ProductRef[] | null;
}

const BATCH_SELECT =
  'id, from_user_id, to_user_id, notes, total_items, total_quantity, created_at, from_user:from_user_id (name), to_user:to_user_id (name), creator:created_by (name)';

/** Chave de comparação de código: sem espaços nas pontas, em maiúsculas. */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function toOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Ordem do nº do item (numérico), como as telas de estoque e etiquetas. */
function compareBySku(
  a: { sku: string | null; product_id: number },
  b: { sku: string | null; product_id: number },
): number {
  const na = Number(a.sku);
  const nb = Number(b.sku);
  const va = a.sku !== null && Number.isFinite(na);
  const vb = b.sku !== null && Number.isFinite(nb);
  if (va && vb) return na - nb;
  if (va) return -1;
  if (vb) return 1;
  return a.product_id - b.product_id;
}

function toSummary(row: BatchRow): TransferBatchSummary {
  return {
    id: row.id,
    from_user_id: row.from_user_id,
    from_name: row.from_user?.name ?? null,
    to_user_id: row.to_user_id,
    to_name: row.to_user?.name ?? null,
    notes: row.notes,
    total_items: row.total_items,
    total_quantity: row.total_quantity,
    created_by_name: row.creator?.name ?? null,
    created_at: row.created_at,
  };
}

@Injectable()
export class TransferBatchesService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Lê a planilha (A = código interno, B = quantidade), soma códigos
   * repetidos e confere cada peça contra o estoque da origem. Nada é
   * gravado.
   */
  async buildPreview(
    fileBuffer: Buffer,
    fromUserId: number | null,
    toUserId: number | null,
  ): Promise<TransferBatchPreviewResponse> {
    await this.assertLocations(fromUserId, toUserId);

    const rows = this.parseWorkbook(fileBuffer);
    const erros: TransferBatchErrorRow[] = [];
    const groups = new Map<string, CodeGroup>();

    for (const row of rows) {
      if (!row.code) {
        erros.push({
          row_numbers: [row.row_number],
          code: '',
          reason: 'Código vazio',
        });
        continue;
      }
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) {
        erros.push({
          row_numbers: [row.row_number],
          code: row.code,
          reason: 'Quantidade inválida (use um número inteiro maior que zero)',
        });
        continue;
      }

      const key = normalizeCode(row.code);
      const group = groups.get(key) ?? {
        code: row.code,
        quantity: 0,
        row_numbers: [],
      };
      group.quantity += row.quantity;
      group.row_numbers.push(row.row_number);
      groups.set(key, group);
    }

    const products = await this.findProductsBySku([...groups.values()]);
    const available = await this.loadAvailable(
      [...products.values()].map((p) => p.id),
      fromUserId,
    );

    const validos: TransferBatchItemPreview[] = [];
    for (const [key, group] of groups) {
      const product = products.get(key);
      if (!product) {
        erros.push({
          row_numbers: group.row_numbers,
          code: group.code,
          reason: 'Código não encontrado',
        });
        continue;
      }

      const onHand = available.get(product.id) ?? 0;
      if (group.quantity > onHand) {
        erros.push({
          row_numbers: group.row_numbers,
          code: group.code,
          reason: `Estoque insuficiente na origem para "${product.name}": disponível ${onHand}, pedido ${group.quantity}`,
        });
        continue;
      }

      validos.push({
        product_id: product.id,
        sku: product.sku,
        sku2: product.sku2,
        name: product.name,
        price: product.price,
        quantity: group.quantity,
        available: onHand,
        row_numbers: group.row_numbers,
      });
    }

    validos.sort(compareBySku);
    erros.sort((a, b) => a.row_numbers[0] - b.row_numbers[0]);
    return { validos, erros };
  }

  /** Tudo que a revendedora tem agora (para devolver ao Central). */
  async buildPreviewAll(
    fromUserId: number,
  ): Promise<TransferBatchPreviewResponse> {
    await this.assertLocations(fromUserId, null);

    let rows: LocationWithProductRow[];
    try {
      rows = await fetchAllPages<LocationWithProductRow>((from, to) =>
        this.supabase
          .from('inventory_locations')
          .select(
            'product_id, quantity, products:product_id (id, sku, sku2, name, price)',
          )
          .eq('user_id', fromUserId)
          .gt('quantity', 0)
          .order('id')
          .range(from, to),
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Erro ao buscar o estoque da revendedora: ${(err as Error).message}`,
      );
    }

    const validos: TransferBatchItemPreview[] = rows.map((row) => {
      const product = toOne(row.products);
      return {
        product_id: row.product_id,
        sku: product?.sku ?? null,
        sku2: product?.sku2 ?? null,
        name: product?.name ?? 'Produto removido',
        price: product?.price ?? 0,
        quantity: row.quantity,
        available: row.quantity,
        row_numbers: [],
      };
    });

    validos.sort(compareBySku);
    return { validos, erros: [] };
  }

  /** Transfere as peças confirmadas (atômico no banco). */
  async create(dto: CreateTransferBatchDto, user?: AuthUser) {
    const fromUserId = dto.from_user_id ?? null;
    const toUserId = dto.to_user_id ?? null;
    await this.assertLocations(fromUserId, toUserId);

    const { data, error } = await this.supabase.rpc('fn_transfer_stock_batch', {
      p_from_user_id: fromUserId,
      p_to_user_id: toUserId,
      p_notes: dto.notes?.trim() || null,
      p_created_by: user?.sub ?? null,
      p_items: dto.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
      })),
    });

    if (error) {
      const message = error.message ?? '';
      if (message.includes('INSUFFICIENT_STOCK')) {
        throw new BadRequestException(
          `${extractInsufficientStockMessage(message)}. Nada foi transferido: gere a prévia de novo.`,
        );
      }
      if (message.includes('INVALID_TRANSFER')) {
        throw new BadRequestException(
          message.replace(/^.*INVALID_TRANSFER:\s*/, ''),
        );
      }
      if (error.code === '23503') {
        throw new BadRequestException(
          'Peça ou revendedora não encontrada. Nada foi transferido.',
        );
      }
      throw new InternalServerErrorException(
        `Erro ao transferir as peças: ${message}`,
      );
    }

    return { id: data };
  }

  /** Histórico de lotes (mais recentes primeiro). */
  async findAll(filters: ListTransferBatchesDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;

    let query = this.supabase
      .from('inventory_transfer_batches')
      .select(BATCH_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (filters.location) {
      const userId = parseLocation(filters.location);
      query =
        userId === null
          ? query.or('from_user_id.is.null,to_user_id.is.null')
          : query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
    }

    const { data, error, count } = await query.range(from, from + limit - 1);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar as transferências: ${error.message}`,
      );
    }

    const rows = (data ?? []) as unknown as BatchRow[];
    return {
      data: rows.map(toSummary),
      pagination: { page, limit, total: count ?? rows.length },
    };
  }

  /** Lote + peças, para o romaneio. */
  async findOne(id: number): Promise<TransferBatchDetail> {
    const { data, error } = await this.supabase
      .from('inventory_transfer_batches')
      .select(BATCH_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar a transferência: ${error.message}`,
      );
    }
    if (!data) {
      throw new NotFoundException('Transferência não encontrada');
    }

    let rows: TransferItemRow[];
    try {
      rows = await fetchAllPages<TransferItemRow>((from, to) =>
        this.supabase
          .from('inventory_transfers')
          .select(
            'id, product_id, quantity, products:product_id (id, sku, sku2, name, price)',
          )
          .eq('batch_id', id)
          .order('id')
          .range(from, to),
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Erro ao buscar as peças da transferência: ${(err as Error).message}`,
      );
    }

    const items: TransferBatchDetailItem[] = rows.map((row) => {
      const product = toOne(row.products);
      return {
        product_id: row.product_id,
        sku: product?.sku ?? null,
        sku2: product?.sku2 ?? null,
        name: product?.name ?? 'Produto removido',
        price: product?.price ?? 0,
        quantity: row.quantity,
      };
    });
    items.sort(compareBySku);

    return { ...toSummary(data as unknown as BatchRow), items };
  }

  // --------------------------------------------------------------------
  // Regras de local
  // --------------------------------------------------------------------

  /**
   * Origem ≠ destino; quem não é o Central precisa ser revendedora. O
   * destino precisa estar ativo; a origem não (dá para recolher o estoque
   * de quem foi desativada).
   */
  private async assertLocations(
    fromUserId: number | null,
    toUserId: number | null,
  ): Promise<void> {
    if (fromUserId === toUserId) {
      throw new BadRequestException(
        'Origem e destino precisam ser diferentes.',
      );
    }

    const ids = [fromUserId, toUserId].filter(
      (id): id is number => id !== null,
    );
    if (ids.length === 0) return;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, is_active, roles:role_id (name)')
      .in('id', ids);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao conferir as revendedoras: ${error.message}`,
      );
    }

    const users = (data ?? []) as unknown as UserRoleRow[];
    const isReseller = (id: number, mustBeActive: boolean) => {
      const user = users.find((u) => u.id === id);
      if (!user || toOne(user.roles)?.name !== 'vendedor') return false;
      return !mustBeActive || user.is_active === true;
    };

    if (fromUserId !== null && !isReseller(fromUserId, false)) {
      throw new BadRequestException(INVALID_LOCATION_MESSAGE);
    }
    if (toUserId !== null && !isReseller(toUserId, true)) {
      throw new BadRequestException(INVALID_LOCATION_MESSAGE);
    }
  }

  // --------------------------------------------------------------------
  // Planilha
  // --------------------------------------------------------------------

  /**
   * Layout do modelo (public/modelos/modelo-transferencia-estoque.xlsx):
   * linha 1 = cabeçalho (ignorada), A = código interno (nº do item),
   * B = quantidade. Linhas totalmente vazias são puladas; colunas depois
   * da B são ignoradas (é onde o modelo põe as instruções).
   */
  private parseWorkbook(fileBuffer: Buffer): ParsedRow[] {
    let data: SheetCell[][];
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    } catch {
      throw new BadRequestException(
        'Não foi possível ler a planilha. Use o modelo .xlsx.',
      );
    }

    const rows: ParsedRow[] = [];
    for (let i = 1; i < data.length; i++) {
      const [codeCell, qtyCell] = data[i] ?? [];
      const code = this.readCode(codeCell);
      const rawQty = this.readText(qtyCell);
      if (!code && !rawQty) continue; // linha vazia, não é erro

      rows.push({
        row_number: i + 1,
        code,
        quantity: this.parseQuantity(qtyCell),
      });
    }

    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(
        `A planilha tem ${rows.length} linhas; o limite é ${MAX_ROWS}.`,
      );
    }
    return rows;
  }

  private readText(cell: SheetCell): string {
    if (cell === undefined || cell === null) return '';
    return String(cell).trim();
  }

  /** Código numérico digitado como número (205) vira "205". */
  private readCode(cell: SheetCell): string {
    if (typeof cell === 'number' && Number.isInteger(cell)) {
      return String(cell);
    }
    return this.readText(cell);
  }

  private parseQuantity(cell: SheetCell): number {
    if (typeof cell === 'number') return cell;
    const text = this.readText(cell).replace(',', '.');
    return text === '' ? NaN : Number(text);
  }

  // --------------------------------------------------------------------
  // Consultas
  // --------------------------------------------------------------------

  /** Produtos pelo nº do item (sku), indexados pelo código normalizado. */
  private async findProductsBySku(
    groups: CodeGroup[],
  ): Promise<Map<string, ProductRef>> {
    const found = new Map<string, ProductRef>();

    for (let i = 0; i < groups.length; i += LOOKUP_CHUNK) {
      const chunk = groups.slice(i, i + LOOKUP_CHUNK);
      // O banco compara exato: manda como digitado e em maiúsculas.
      const variants = [
        ...new Set(chunk.flatMap((g) => [g.code, normalizeCode(g.code)])),
      ];

      const { data, error } = await this.supabase
        .from('products')
        .select('id, sku, sku2, name, price')
        .in('sku', variants);

      if (error) {
        throw new InternalServerErrorException(
          `Erro ao buscar as peças: ${error.message}`,
        );
      }

      for (const product of (data ?? []) as ProductRef[]) {
        const key = normalizeCode(product.sku ?? '');
        if (key && !found.has(key)) found.set(key, product);
      }
    }

    return found;
  }

  /** Quantidade de cada produto na localidade (null = Central). */
  private async loadAvailable(
    productIds: number[],
    userId: number | null,
  ): Promise<Map<number, number>> {
    const available = new Map<number, number>();

    for (let i = 0; i < productIds.length; i += LOOKUP_CHUNK) {
      const chunk = productIds.slice(i, i + LOOKUP_CHUNK);
      const base = this.supabase
        .from('inventory_locations')
        .select('product_id, quantity');
      const byLocation =
        userId === null ? base.is('user_id', null) : base.eq('user_id', userId);

      const { data, error } = await byLocation.in('product_id', chunk);

      if (error) {
        throw new InternalServerErrorException(
          `Erro ao buscar o estoque da origem: ${error.message}`,
        );
      }

      for (const row of data ?? []) {
        available.set(row.product_id, row.quantity);
      }
    }

    return available;
  }
}
