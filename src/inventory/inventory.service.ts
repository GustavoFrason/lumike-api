/**
 * InventoryService
 * --------------------
 * Responsável por operações de gestão de estoque.
 *
 * As movimentações (entrada/saída/transferência) delegam para funções
 * atômicas no Postgres (fn_adjust_stock / fn_transfer_stock — ver migration
 * 20260804_atomic_stock_and_orders.sql). Isso elimina a condição de corrida
 * que existia antes: ler a quantidade, comparar em JS e só depois escrever
 * é uma janela onde duas vendas concorrentes do último item podiam ambas
 * passar da checagem. A função no banco faz tudo em um único UPDATE
 * condicional, então a concorrência é resolvida pelo próprio Postgres.
 */

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import {
  StockAdjustmentDto,
  StockEntryDto,
  StockExitDto,
  StockTransferDto,
} from './dto/stock-movement.dto';
import { extractInsufficientStockMessage } from '../common/utils/stock-error.util';

interface UserJoinRow {
  id: number;
  name: string;
}

interface ProductJoinRow {
  id: number;
  name: string;
  sku: string | null;
  price: number;
  current_stock?: number;
}

// O supabase-js não consegue inferir estaticamente se um join to-one vem
// como objeto ou array de 1 item quando há mais de uma relação embutida na
// mesma query (getAllSellersStock junta users E products) — na prática vem
// sempre objeto (ou null), mas tipamos a união e mantemos a checagem
// defensiva com Array.isArray já existente.
type ToOneJoin<T> = T | T[] | null;

interface StockLocationWithUserRow {
  id: number;
  quantity: number;
  user_id: number | null;
  users: ToOneJoin<UserJoinRow>;
}

interface StockLocationWithProductRow {
  quantity: number;
  product_id: number;
  products: ToOneJoin<ProductJoinRow>;
}

interface StockLocationWithUserAndProductRow {
  user_id: number | null;
  quantity: number;
  product_id: number;
  users: ToOneJoin<UserJoinRow>;
  products: ToOneJoin<ProductJoinRow>;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /** Registra entrada de estoque em uma localidade específica. */
  async addStock(
    productId: number,
    dto: StockEntryDto,
    userId: number | null = null,
  ) {
    const newQuantity = await this.callAdjustStock(
      productId,
      userId,
      dto.quantity,
      dto.reference,
    );
    return { success: true, newQuantity };
  }

  /** Registra saída de estoque de uma localidade específica. */
  async removeStock(
    productId: number,
    dto: StockExitDto,
    userId: number | null = null,
  ) {
    const newQuantity = await this.callAdjustStock(
      productId,
      userId,
      -dto.quantity,
      dto.reference,
    );
    return { success: true, newQuantity };
  }

  /** Transfere estoque entre localidades — saída e entrada em uma única transação. */
  async transferStock(productId: number, dto: StockTransferDto) {
    const fromUserId = dto.from_user_id ?? null;
    const toUserId = dto.to_user_id ?? null;

    if (fromUserId === toUserId) {
      throw new BadRequestException('Origem e destino não podem ser iguais.');
    }

    const { error } = await this.supabase.rpc('fn_transfer_stock', {
      p_product_id: productId,
      p_from_user_id: fromUserId,
      p_to_user_id: toUserId,
      p_quantity: dto.quantity,
      p_notes: dto.notes ?? null,
    });

    if (error) {
      this.handleAdjustStockError(error, productId);
    }

    return { success: true };
  }

  /**
   * Registra uma conferência física de estoque: compara o que o sistema
   * aponta numa localidade com o que foi contado e ajusta a diferença.
   * O ajuste em si (inventory_locations/inventory_movements) acontece via
   * trigger (trf_stock_adjustments_ai -> fn_adjust_stock), atômico e sem
   * lookup extra — este método só calcula o delta e insere o registro.
   */
  async adjustFromCount(
    productId: number,
    dto: StockAdjustmentDto,
    createdBy: number | null,
  ) {
    const userId = dto.user_id ?? null;

    let locationQuery = this.supabase
      .from('inventory_locations')
      .select('quantity')
      .eq('product_id', productId);
    locationQuery =
      userId === null
        ? locationQuery.is('user_id', null)
        : locationQuery.eq('user_id', userId);

    const { data: location, error: locationError } =
      await locationQuery.maybeSingle();

    if (locationError) {
      throw new InternalServerErrorException(
        `Erro ao buscar estoque atual: ${locationError.message}`,
      );
    }

    const expected = location?.quantity ?? 0;
    const delta = dto.counted_quantity - expected;

    if (delta === 0) {
      return {
        success: true,
        expected_quantity: expected,
        counted_quantity: dto.counted_quantity,
        delta: 0,
        message: 'Nenhuma diferença encontrada — nada foi ajustado.',
      };
    }

    const { error } = await this.supabase.from('stock_adjustments').insert({
      product_id: productId,
      user_id: userId,
      delta,
      expected_quantity: expected,
      counted_quantity: dto.counted_quantity,
      reason: dto.reason,
      created_by: createdBy,
    });

    if (error) {
      this.handleAdjustStockError(error, productId);
    }

    return {
      success: true,
      expected_quantity: expected,
      counted_quantity: dto.counted_quantity,
      delta,
    };
  }

  /**
   * Obtém o estoque detalhado de um produto (Central + Vendedores)
   */
  async getProductStock(productId: number) {
    const { data, error } = await this.supabase
      .from('inventory_locations')
      .select(
        `
        id,
        quantity,
        user_id,
        users:user_id (id, name)
      `,
      )
      .eq('product_id', productId);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar estoque detalhado: ${error.message}`,
      );
    }

    const rows = (data || []) as unknown as StockLocationWithUserRow[];
    const total = rows.reduce((sum, item) => sum + item.quantity, 0);
    const central = rows.find((item) => item.user_id === null)?.quantity || 0;
    const sellers = rows
      .filter((item) => item.user_id !== null)
      .map((item) => {
        const u = Array.isArray(item.users) ? item.users[0] : item.users;
        return {
          user_id: item.user_id,
          name: u?.name || 'Desconhecido',
          quantity: item.quantity,
        };
      });

    return {
      product_id: productId,
      total,
      central,
      sellers,
    };
  }

  /**
   * Obtém todos os produtos e quantidades em posse de um usuário específico
   */
  async getUserStock(userId: number) {
    const { data, error } = await this.supabase
      .from('inventory_locations')
      .select(
        `
        quantity,
        product_id,
        products:product_id (id, name, sku, price, current_stock)
      `,
      )
      .eq('user_id', userId)
      .gt('quantity', 0); // Apenas o que ele realmente tem

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar estoque do usuário: ${error.message}`,
      );
    }

    const rows = (data || []) as unknown as StockLocationWithProductRow[];
    return rows.map((item) => {
      const p = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        product_id: item.product_id,
        name: p?.name || 'Produto Removido',
        sku: p?.sku || 'N/A',
        price: p?.price || 0,
        quantity: item.quantity,
      };
    });
  }

  /**
   * Obtém, de uma vez, tudo que está em posse de cada revendedor(a) — para
   * conferência periódica de inventário (semanal/mensal), sem precisar
   * abrir um relatório por pessoa.
   */
  async getAllSellersStock() {
    const { data, error } = await this.supabase
      .from('inventory_locations')
      .select(
        `
        user_id,
        quantity,
        product_id,
        users:user_id (id, name),
        products:product_id (id, name, sku, price)
      `,
      )
      .not('user_id', 'is', null)
      .gt('quantity', 0);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar estoque dos revendedores: ${error.message}`,
      );
    }

    const bySeller = new Map<
      number,
      {
        user_id: number;
        name: string;
        items: Array<{
          product_id: number;
          name: string;
          sku: string;
          price: number;
          quantity: number;
        }>;
      }
    >();

    const rows = (data ||
      []) as unknown as StockLocationWithUserAndProductRow[];
    for (const item of rows) {
      const user = Array.isArray(item.users) ? item.users[0] : item.users;
      const product = Array.isArray(item.products)
        ? item.products[0]
        : item.products;
      if (!item.user_id || !user) continue;

      if (!bySeller.has(item.user_id)) {
        bySeller.set(item.user_id, {
          user_id: item.user_id,
          name: user.name || 'Revendedor removido',
          items: [],
        });
      }

      bySeller.get(item.user_id)!.items.push({
        product_id: item.product_id,
        name: product?.name || 'Produto Removido',
        sku: product?.sku || 'N/A',
        price: product?.price || 0,
        quantity: item.quantity,
      });
    }

    return Array.from(bySeller.values())
      .map((seller) => ({
        ...seller,
        total_items: seller.items.reduce((sum, i) => sum + i.quantity, 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Obtém o histórico de movimentações de um produto
   */
  async getProductHistory(productId: number, limit: number = 50) {
    const { data, error } = await this.supabase
      .from('inventory_movements')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar histórico: ${error.message}`,
      );
    }

    return data;
  }

  /** Chama fn_adjust_stock e devolve a nova quantidade da localidade. */
  private async callAdjustStock(
    productId: number,
    userId: number | null,
    delta: number,
    reference?: string,
  ): Promise<number> {
    const { data, error } = await this.supabase.rpc('fn_adjust_stock', {
      p_product_id: productId,
      p_user_id: userId,
      p_delta: delta,
      p_reference: reference ?? null,
    });

    if (error) {
      this.handleAdjustStockError(error, productId);
    }

    return data;
  }

  /** Traduz o erro de negócio levantado pela função do Postgres em uma exceção HTTP apropriada. */
  private handleAdjustStockError(
    error: { message: string },
    productId: number,
  ): never {
    if (error.message?.includes('INSUFFICIENT_STOCK')) {
      throw new BadRequestException(
        extractInsufficientStockMessage(error.message),
      );
    }
    this.logger.error(
      `Erro ao ajustar estoque do produto ${productId}: ${error.message}`,
    );
    throw new InternalServerErrorException(
      `Erro ao atualizar estoque: ${error.message}`,
    );
  }
}
