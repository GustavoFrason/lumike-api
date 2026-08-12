import {
  BadRequestException,
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import * as XLSX from 'xlsx';
import { SettingsService } from '../settings/settings.service';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import {
  ErrorRow,
  ExistingProductRef,
  ImportPreviewResponse,
  ImportRow,
  NewProductRow,
  NonCatalogRow,
  UpdateStockRow,
} from './purchase-import.types';

/** Célula crua de planilha: o que o `xlsx` realmente pode devolver por célula. */
type SheetCell = string | number | boolean | Date | undefined;

const ZARPELLON_SUPPLIER_NAME = 'Zarpellon Joias';
const FALLBACK_CATEGORY_NAME = 'A classificar';

// Usados só se a chave ainda não existir em site_settings (defensivo — a
// migration 20260811000001 já semeia essas duas chaves).
const DEFAULT_IGNORE_KEYWORDS =
  'SACOLA,MALETA,CAIXA,ETIQUETA,DISPLAY,EMBALAGEM';
const DEFAULT_CATEGORY_KEYWORDS_JSON =
  '{"ANEL":"Aneis","BRINCO":"Brincos","PIERCING":"Piercings","CORRENTE":"Colares","COLAR":"Colares","PULSEIRA":"Pulseiras"}';

@Injectable()
export class PurchaseImportService {
  private readonly logger = new Logger(PurchaseImportService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Lê a planilha, classifica cada linha e devolve os 4 buckets do preview
   * — nada é persistido ainda, tudo fica editável no frontend até o
   * `confirm`.
   */
  async buildPreview(fileBuffer: Buffer): Promise<ImportPreviewResponse> {
    const parsed = this.parseWorkbook(fileBuffer);
    const consolidated = this.consolidateDuplicates(parsed);

    const erros: ErrorRow[] = [];
    const validRows: ImportRow[] = [];
    for (const row of consolidated) {
      const reason = this.validateRow(row);
      if (reason) {
        erros.push({
          row_number: row.row_number,
          sku2: row.sku2,
          name: row.name,
          reason,
        });
        continue;
      }
      validRows.push(row);
    }

    const ignoreKeywords = await this.getIgnoreKeywords();
    const naoCatalogaveis: NonCatalogRow[] = [];
    const catalogRows: ImportRow[] = [];
    for (const row of validRows) {
      const matched = this.matchIgnoreKeyword(row.name, ignoreKeywords);
      if (matched) {
        naoCatalogaveis.push({ ...row, matched_keyword: matched });
        continue;
      }
      catalogRows.push(row);
    }

    const existingMap = await this.findExistingProducts(
      catalogRows.map((r) => r.sku2),
    );
    const categoryKeywords = await this.getCategoryKeywords();
    const categoryCache = new Map<string, number | null>();

    const atualizacoes: UpdateStockRow[] = [];
    const novos: NewProductRow[] = [];

    for (const row of catalogRows) {
      const existing = existingMap.get(row.sku2);
      if (existing) {
        atualizacoes.push({ ...row, existing_product: existing });
        continue;
      }

      const suggestion = await this.suggestCategory(
        row.name,
        categoryKeywords,
        categoryCache,
      );
      novos.push({
        ...row,
        category_id: suggestion.category_id,
        category_name: suggestion.category_name,
        category_low_confidence: suggestion.low_confidence,
        suggested_price: Math.round(row.unit_cost * 3 * 100) / 100,
      });
    }

    return { novos, atualizacoes, naoCatalogaveis, erros };
  }

  /**
   * Persiste a lista já revisada/aprovada pelo usuário. Tudo acontece numa
   * chamada só de `fn_import_purchase_excel` (uma função plpgsql = uma
   * transação Postgres inteira) — se qualquer item falhar, nada é gravado.
   */
  async confirm(dto: ConfirmImportDto) {
    for (const item of dto.items) {
      if (item.is_new && (!item.sku2 || !item.name)) {
        throw new BadRequestException(
          'sku2 e name são obrigatórios para item novo',
        );
      }
      if (!item.is_new && !item.product_id) {
        throw new BadRequestException(
          'product_id é obrigatório para item de atualização de estoque',
        );
      }
    }

    const supplierId = await this.resolveZarpellonSupplierId();
    // O front já manda a data escolhida no calendário (default: hoje no
    // fuso de Brasília — ver getTodayInSaoPaulo em lumike-ui). O fallback
    // aqui é só defensivo (chamada direta na API sem esse campo); usar
    // "hoje" do servidor não é ideal (pode não estar em horário de
    // Brasília), mas é melhor que rejeitar a importação por causa disso.
    const purchaseDate =
      dto.purchase_date || new Date().toISOString().slice(0, 10);

    const items = dto.items.map((item) => ({
      is_new: item.is_new,
      product_id: item.product_id ?? null,
      sku2: item.sku2 ?? null,
      name: item.name ?? null,
      category_id: item.category_id ?? null,
      purchase_date: purchaseDate,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    }));

    const { data: purchaseId, error } = await this.supabase.rpc(
      'fn_import_purchase_excel',
      {
        p_supplier_id: supplierId,
        p_notes: dto.notes ?? 'Importação de planilha Excel - Zarpellon Joias',
        p_items: items,
      },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao confirmar importação: ${error.message}`,
      );
    }

    return {
      purchase_id: purchaseId,
      created: dto.items.filter((i) => i.is_new).length,
      updated: dto.items.filter((i) => !i.is_new).length,
    };
  }

  // --------------------------------------------------------------------
  // Parsing
  // --------------------------------------------------------------------

  /**
   * Layout fixo da planilha da Zarpellon: linha 1 é sempre o cabeçalho
   * (Produto/Descrição/Qtd./Valor Base), dados a partir da linha 2 —
   * diferente do parser de NF-e antigo, aqui não tem scan de header por
   * texto porque o formato é conhecido e estável.
   */
  private parseWorkbook(fileBuffer: Buffer): ImportRow[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: SheetCell[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
    });

    const rows: ImportRow[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const [sku2Cell, nameCell, qtyCell, costCell] = row;
      if (
        sku2Cell === undefined &&
        nameCell === undefined &&
        qtyCell === undefined &&
        costCell === undefined
      ) {
        continue; // linha totalmente vazia, não é erro
      }

      rows.push({
        row_number: i + 1,
        // Sempre força string: o SKU é o código de rastreio com o
        // fornecedor e precisa ser gravado exatamente como veio na célula
        // (sem strip nem padding de zero à esquerda) — o único cuidado
        // aqui é não deixar o valor virar number e perder um zero à
        // esquerda na conversão.
        sku2: this.readCellAsString(sku2Cell),
        name: this.readCellAsString(nameCell),
        quantity: this.parseNumberCell(qtyCell),
        unit_cost: this.parseNumberCell(costCell),
      });
    }

    return rows;
  }

  private readCellAsString(cell: SheetCell): string {
    if (cell === undefined || cell === null) return '';
    return String(cell).trim();
  }

  private parseNumberCell(cell: SheetCell): number {
    if (cell === undefined || cell === null || cell === '') return NaN;
    if (typeof cell === 'number') return cell;
    // Normaliza vírgula decimal ("29,5" -> "29.5").
    const normalized = String(cell).trim().replace(',', '.');
    return parseFloat(normalized);
  }

  /** Mesmo sku2 (string exata) repetido no arquivo: soma quantidade, fica com o último custo. */
  private consolidateDuplicates(rows: ImportRow[]): ImportRow[] {
    const bySku = new Map<string, ImportRow>();
    const result: ImportRow[] = [];

    for (const row of rows) {
      if (!row.sku2) {
        result.push(row);
        continue;
      }

      const existing = bySku.get(row.sku2);
      if (existing) {
        existing.quantity =
          (Number.isFinite(existing.quantity) ? existing.quantity : 0) +
          (Number.isFinite(row.quantity) ? row.quantity : 0);
        existing.unit_cost = row.unit_cost; // último preço de custo vence
        existing.duplicated_in_file = true;
        continue;
      }

      const copy = { ...row };
      bySku.set(row.sku2, copy);
      result.push(copy);
    }

    return result;
  }

  private validateRow(row: ImportRow): string | null {
    if (!row.sku2) return 'SKU vazio';
    if (!row.name) return 'Descrição vazia';
    if (!Number.isFinite(row.quantity) || row.quantity <= 0)
      return 'Quantidade inválida';
    if (!Number.isFinite(row.unit_cost) || row.unit_cost < 0)
      return 'Preço inválido';
    return null;
  }

  private matchIgnoreKeyword(name: string, keywords: string[]): string | null {
    const upperName = name.toUpperCase();
    return keywords.find((kw) => upperName.includes(kw.toUpperCase())) ?? null;
  }

  private async findExistingProducts(
    skus: string[],
  ): Promise<Map<string, ExistingProductRef>> {
    const map = new Map<string, ExistingProductRef>();
    if (skus.length === 0) return map;

    const { data, error } = await this.supabase
      .from('products')
      .select('id, sku2, name, current_stock')
      .in('sku2', skus);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar produtos existentes: ${error.message}`,
      );
    }

    for (const p of data ?? []) {
      if (p.sku2) {
        map.set(p.sku2, {
          id: p.id,
          name: p.name,
          current_stock: p.current_stock,
        });
      }
    }

    return map;
  }

  // --------------------------------------------------------------------
  // Categoria / fornecedor
  // --------------------------------------------------------------------

  private async suggestCategory(
    description: string,
    keywordMap: Record<string, string>,
    cache: Map<string, number | null>,
  ): Promise<{
    category_id: number;
    category_name: string;
    low_confidence: boolean;
  }> {
    const upperDesc = description.toUpperCase();
    for (const [keyword, categoryName] of Object.entries(keywordMap)) {
      if (upperDesc.startsWith(keyword.toUpperCase())) {
        const id = await this.findCategoryIdByName(categoryName, cache);
        if (id) {
          return {
            category_id: id,
            category_name: categoryName,
            low_confidence: false,
          };
        }
        // A categoria do dicionário não existe (ainda) no catálogo — cai
        // pro fallback abaixo em vez de travar a importação.
        break;
      }
    }

    const fallbackId = await this.ensureFallbackCategoryId(cache);
    return {
      category_id: fallbackId,
      category_name: FALLBACK_CATEGORY_NAME,
      low_confidence: true,
    };
  }

  private async findCategoryIdByName(
    name: string,
    cache: Map<string, number | null>,
  ): Promise<number | null> {
    if (cache.has(name)) return cache.get(name) ?? null;

    const { data } = await this.supabase
      .from('categories')
      .select('id')
      .ilike('name', name)
      .maybeSingle();

    const id = data?.id ?? null;
    cache.set(name, id);
    return id;
  }

  private async ensureFallbackCategoryId(
    cache: Map<string, number | null>,
  ): Promise<number> {
    const existing = await this.findCategoryIdByName(
      FALLBACK_CATEGORY_NAME,
      cache,
    );
    if (existing) return existing;

    const { data, error } = await this.supabase
      .from('categories')
      .insert({ name: FALLBACK_CATEGORY_NAME })
      .select('id')
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao criar categoria padrão "${FALLBACK_CATEGORY_NAME}": ${error.message}`,
      );
    }

    cache.set(FALLBACK_CATEGORY_NAME, data.id);
    return data.id;
  }

  /** Fornecedor é sempre fixo (Zarpellon) — busca por nome, cria se ainda não existir. */
  private async resolveZarpellonSupplierId(): Promise<number> {
    const { data: existing } = await this.supabase
      .from('suppliers')
      .select('id')
      .eq('name', ZARPELLON_SUPPLIER_NAME)
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error } = await this.supabase
      .from('suppliers')
      .insert({ name: ZARPELLON_SUPPLIER_NAME })
      .select('id')
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao localizar/criar fornecedor "${ZARPELLON_SUPPLIER_NAME}": ${error.message}`,
      );
    }

    return created.id;
  }

  // --------------------------------------------------------------------
  // Config editável (site_settings)
  // --------------------------------------------------------------------

  private async getIgnoreKeywords(): Promise<string[]> {
    const raw = await this.getSettingValue(
      'import_excel_ignore_keywords',
      DEFAULT_IGNORE_KEYWORDS,
    );
    return raw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }

  private async getCategoryKeywords(): Promise<Record<string, string>> {
    const raw = await this.getSettingValue(
      'import_excel_category_keywords',
      DEFAULT_CATEGORY_KEYWORDS_JSON,
    );
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      this.logger.warn(
        'site_settings.import_excel_category_keywords não é um JSON válido — usando dicionário padrão',
      );
      return JSON.parse(DEFAULT_CATEGORY_KEYWORDS_JSON) as Record<
        string,
        string
      >;
    }
  }

  private async getSettingValue(
    key: string,
    fallback: string,
  ): Promise<string> {
    try {
      const setting = await this.settingsService.findOne(key);
      return setting.value ?? fallback;
    } catch {
      return fallback;
    }
  }
}
