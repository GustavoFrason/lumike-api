/**
 * ResellersService
 * --------------------
 * Acerto com revendedora (papel vendedor = revendedora com "mala" própria).
 *
 * Regra: ela recebe dos clientes, fica com a comissão (commission_rate %
 * sobre o que ela vendeu) e repassa à loja o resto.
 *   recebido   = vendas que saíram da mala dela (stock_location_user_id)
 *   comissão   = commission_rate × vendas em que ela é a vendedora (seller_id)
 *   a repassar = recebido − comissão
 * O registro do acerto é atômico em fn_create_reseller_settlement (que
 * também impede venda acertada duas vezes e acerta o caixa).
 */

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import type { AuthUser } from '../auth/types/auth-user.type';
import { StaffRole } from '../auth/enums/role.enum';
import { fetchAllPages } from '../common/utils/fetch-all-pages.util';
import {
  saoPauloRange,
  todayInSaoPaulo,
} from '../common/utils/sao-paulo-date.util';
import { CreateSettlementDto } from './dto/create-settlement.dto';

const round2 = (value: number) => Math.round(value * 100) / 100;
const DEFAULT_COMMISSION_RATE = 20;
/** Ids por consulta `.in()` (limita o tamanho da URL). */
const ID_CHUNK = 200;

interface Reseller {
  id: number;
  name: string;
  is_active: boolean;
  commission_rate: number;
}

interface OrderRow {
  id: number;
  created_at: string;
  total_amount: number;
  seller_id: number | null;
  stock_location_user_id: number | null;
  customers: { name: string } | null;
  order_items: { quantity: number }[];
}

export interface StatementOrder {
  id: number;
  created_at: string;
  customer_name: string | null;
  total: number;
  pieces: number;
  /** Saiu da mala dela (o dinheiro está com ela). */
  from_her_stock: boolean;
  /** Ela é a vendedora (entra na base da comissão). */
  is_her_sale: boolean;
}

export interface StatementTotals {
  orders_count: number;
  pieces: number;
  collected: number;
  commission_base: number;
  commission: number;
  amount_due: number;
}

export interface ResellerStatement {
  reseller: Reseller;
  period: { start: string | null; end: string };
  orders: StatementOrder[];
  totals: StatementTotals;
  /** Saldo dos acertos anteriores (positivo = ela ainda deve à loja). */
  previous_balance: number;
  /** a repassar + saldo anterior. */
  balance_to_pay: number;
  transfers: {
    sent_pieces: number;
    sent_value: number;
    returned_pieces: number;
    returned_value: number;
  };
  current_stock: {
    pieces: number;
    value: number;
    items: {
      product_id: number;
      name: string;
      sku: string | null;
      quantity: number;
      price: number;
    }[];
  };
  last_settlement: {
    id: number;
    period_end: string;
    created_at: string;
  } | null;
}

export interface ResellerListItem {
  id: number;
  name: string;
  is_active: boolean;
  commission_rate: number;
  stock_pieces: number;
  stock_value: number;
  unsettled_orders: number;
  /** A repassar das vendas ainda não acertadas + saldo anterior. */
  balance_to_pay: number;
  last_settlement_at: string | null;
}

/** Soma o "recebido/comissão/a repassar" de um conjunto de vendas (mesma conta do banco). */
export function computeStatementTotals(
  orders: StatementOrder[],
  commissionRate: number,
): StatementTotals {
  const collected = round2(
    orders.filter((o) => o.from_her_stock).reduce((s, o) => s + o.total, 0),
  );
  const commissionBase = round2(
    orders.filter((o) => o.is_her_sale).reduce((s, o) => s + o.total, 0),
  );
  const commission = round2((commissionBase * commissionRate) / 100);
  return {
    orders_count: orders.length,
    pieces: orders.reduce((s, o) => s + o.pieces, 0),
    collected,
    commission_base: commissionBase,
    commission,
    amount_due: round2(collected - commission),
  };
}

@Injectable()
export class ResellersService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /** Revendedoras (inclusive inativas — podem ter estoque ou vendas a acertar). */
  async list(): Promise<ResellerListItem[]> {
    const resellers = await this.findResellers();
    if (resellers.length === 0) return [];
    const ids = resellers.map((r) => r.id);

    const [stockRows, settlements, unsettled] = await Promise.all([
      this.fetchStock(ids),
      this.fetchSettlements(ids),
      this.fetchUnsettledOrders(ids),
    ]);

    return resellers.map((r) => {
      const stock = stockRows.filter((s) => s.user_id === r.id);
      const mySettlements = settlements.filter(
        (s) => s.reseller_user_id === r.id,
      );
      const myOrders = unsettled
        .filter(
          (o) => o.seller_id === r.id || o.stock_location_user_id === r.id,
        )
        .map((o) => this.toStatementOrder(o, r.id));
      const totals = computeStatementTotals(myOrders, r.commission_rate);
      const previousBalance = this.previousBalance(mySettlements);

      return {
        id: r.id,
        name: r.name,
        is_active: r.is_active,
        commission_rate: r.commission_rate,
        stock_pieces: stock.reduce((s, i) => s + i.quantity, 0),
        stock_value: round2(
          stock.reduce((s, i) => s + i.quantity * (i.products?.price ?? 0), 0),
        ),
        unsettled_orders: myOrders.length,
        balance_to_pay: round2(totals.amount_due + previousBalance),
        last_settlement_at: mySettlements[0]?.created_at ?? null,
      };
    });
  }

  /** Extrato do acerto: vendas ainda não acertadas até o fim do período e afins. */
  async getStatement(
    resellerId: number,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<ResellerStatement> {
    const reseller = await this.getReseller(resellerId);
    const end = periodEnd ?? todayInSaoPaulo();
    const range = saoPauloRange(periodStart, end);

    const [orderRows, settlements, transfers, stockRows] = await Promise.all([
      this.fetchUnsettledOrders([resellerId], range.lt),
      this.fetchSettlements([resellerId]),
      this.fetchTransfers(resellerId, range),
      this.fetchStock([resellerId]),
    ]);

    const orders = orderRows.map((o) => this.toStatementOrder(o, resellerId));
    const totals = computeStatementTotals(orders, reseller.commission_rate);
    const previousBalance = this.previousBalance(settlements);

    const sum = (rows: typeof transfers, key: 'to_user_id' | 'from_user_id') =>
      rows
        .filter((t) => t[key] === resellerId)
        .reduce(
          (acc, t) => ({
            pieces: acc.pieces + t.quantity,
            value: acc.value + t.quantity * (t.products?.price ?? 0),
          }),
          { pieces: 0, value: 0 },
        );
    const sent = sum(transfers, 'to_user_id');
    const returned = sum(transfers, 'from_user_id');

    const items = stockRows.map((s) => ({
      product_id: s.product_id,
      name: s.products?.name ?? `Produto #${s.product_id}`,
      sku: s.products?.sku ?? null,
      quantity: s.quantity,
      price: s.products?.price ?? 0,
    }));

    const last = settlements[0];

    return {
      reseller,
      period: { start: periodStart ?? null, end },
      orders,
      totals,
      previous_balance: previousBalance,
      balance_to_pay: round2(totals.amount_due + previousBalance),
      transfers: {
        sent_pieces: sent.pieces,
        sent_value: round2(sent.value),
        returned_pieces: returned.pieces,
        returned_value: round2(returned.value),
      },
      current_stock: {
        pieces: items.reduce((s, i) => s + i.quantity, 0),
        value: round2(items.reduce((s, i) => s + i.quantity * i.price, 0)),
        items,
      },
      last_settlement: last
        ? {
            id: last.id,
            period_end: last.period_end,
            created_at: last.created_at,
          }
        : null,
    };
  }

  /** Registra o acerto (atômico no banco). */
  async createSettlement(
    resellerId: number,
    dto: CreateSettlementDto,
    user?: AuthUser,
  ) {
    await this.getReseller(resellerId);

    const { data, error } = await this.supabase.rpc(
      'fn_create_reseller_settlement',
      {
        p_reseller: resellerId,
        p_period_start: dto.period_start ?? null,
        p_period_end: dto.period_end,
        p_order_ids: [...new Set(dto.order_ids)],
        p_amount_paid: dto.amount_paid,
        p_payment_method: dto.payment_method ?? null,
        p_notes: dto.notes ?? null,
        p_created_by: user?.sub ?? null,
        p_expected_amount_due: dto.expected_amount_due,
      },
    );

    if (error) {
      const message = error.message ?? '';
      if (message.includes('STALE_STATEMENT') || error.code === '23505') {
        throw new ConflictException(
          'As vendas mudaram desde o extrato (cancelamento, venda nova ou acerto já feito). Recarregue e confira antes de registrar.',
        );
      }
      if (message.includes('INVALID_SETTLEMENT')) {
        throw new BadRequestException(
          message.replace(/^.*INVALID_SETTLEMENT:\s*/, ''),
        );
      }
      throw new InternalServerErrorException(
        `Erro ao registrar acerto: ${message}`,
      );
    }

    return { id: data };
  }

  /** Histórico de acertos da revendedora (mais recentes primeiro). */
  async listSettlements(resellerId: number) {
    await this.getReseller(resellerId);
    return this.fetchSettlements([resellerId]);
  }

  // --------------------------------------------------------------------

  private async findResellers(): Promise<Reseller[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, name, is_active, commission_rate, roles:role_id (name)')
      .order('name');

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar revendedoras: ${error.message}`,
      );
    }

    return (data ?? [])
      .filter((u) => u.roles?.name === StaffRole.VENDEDOR)
      .map((u) => ({
        id: u.id,
        name: u.name,
        is_active: u.is_active,
        commission_rate: Number(u.commission_rate ?? DEFAULT_COMMISSION_RATE),
      }));
  }

  private async getReseller(id: number): Promise<Reseller> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, name, is_active, commission_rate, roles:role_id (name)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar revendedora: ${error.message}`,
      );
    }
    if (!data || data.roles?.name !== StaffRole.VENDEDOR) {
      throw new NotFoundException(`Revendedora #${id} não encontrada`);
    }

    return {
      id: data.id,
      name: data.name,
      is_active: data.is_active,
      commission_rate: Number(data.commission_rate ?? DEFAULT_COMMISSION_RATE),
    };
  }

  /**
   * Vendas não canceladas e AINDA NÃO ACERTADAS em que a revendedora é a
   * vendedora ou de cuja mala o estoque saiu (até `beforeIso`, exclusivo).
   */
  private async fetchUnsettledOrders(
    resellerIds: number[],
    beforeIso?: string,
  ): Promise<OrderRow[]> {
    const idList = resellerIds.join(',');
    let rows: OrderRow[];
    try {
      rows = await fetchAllPages<OrderRow>((from, to) => {
        let query = this.supabase
          .from('orders')
          .select(
            'id, created_at, total_amount, seller_id, stock_location_user_id, customers:customer_id (name), order_items (quantity)',
          )
          .neq('status', 'cancelled')
          .or(`seller_id.in.(${idList}),stock_location_user_id.in.(${idList})`);
        if (beforeIso) query = query.lt('created_at', beforeIso);
        return query.order('id').range(from, to);
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Erro ao buscar vendas da revendedora: ${(err as Error).message}`,
      );
    }

    const settled = await this.fetchSettledOrderIds(rows.map((r) => r.id));
    return rows.filter((r) => !settled.has(r.id));
  }

  private async fetchSettledOrderIds(orderIds: number[]): Promise<Set<number>> {
    const settled = new Set<number>();
    for (let i = 0; i < orderIds.length; i += ID_CHUNK) {
      const chunk = orderIds.slice(i, i + ID_CHUNK);
      const { data, error } = await this.supabase
        .from('reseller_settlement_orders')
        .select('order_id')
        .in('order_id', chunk);
      if (error) {
        throw new InternalServerErrorException(
          `Erro ao verificar vendas acertadas: ${error.message}`,
        );
      }
      for (const row of data ?? []) settled.add(row.order_id);
    }
    return settled;
  }

  private async fetchSettlements(resellerIds: number[]) {
    const { data, error } = await this.supabase
      .from('reseller_settlements')
      .select('*')
      .in('reseller_user_id', resellerIds)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar acertos: ${error.message}`,
      );
    }
    return data ?? [];
  }

  private async fetchTransfers(
    resellerId: number,
    range: { gte?: string; lt?: string },
  ) {
    let query = this.supabase
      .from('inventory_transfers')
      .select('quantity, from_user_id, to_user_id, products:product_id (price)')
      .or(`to_user_id.eq.${resellerId},from_user_id.eq.${resellerId}`);
    if (range.gte) query = query.gte('created_at', range.gte);
    if (range.lt) query = query.lt('created_at', range.lt);

    const { data, error } = await query;
    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar transferências: ${error.message}`,
      );
    }
    return (data ?? []) as {
      quantity: number;
      from_user_id: number | null;
      to_user_id: number | null;
      products: { price: number } | null;
    }[];
  }

  private async fetchStock(resellerIds: number[]) {
    const { data, error } = await this.supabase
      .from('inventory_locations')
      .select(
        'product_id, user_id, quantity, products:product_id (name, sku, price)',
      )
      .in('user_id', resellerIds)
      .gt('quantity', 0);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar estoque da revendedora: ${error.message}`,
      );
    }
    return (data ?? []) as {
      product_id: number;
      user_id: number | null;
      quantity: number;
      products: { name: string; sku: string | null; price: number } | null;
    }[];
  }

  private previousBalance(
    settlements: { amount_due: number; amount_paid: number }[],
  ): number {
    return round2(
      settlements.reduce(
        (s, r) => s + Number(r.amount_due) - Number(r.amount_paid),
        0,
      ),
    );
  }

  private toStatementOrder(
    order: OrderRow,
    resellerId: number,
  ): StatementOrder {
    return {
      id: order.id,
      created_at: order.created_at,
      customer_name: order.customers?.name ?? null,
      total: Number(order.total_amount) || 0,
      pieces: (order.order_items ?? []).reduce((s, i) => s + i.quantity, 0),
      from_her_stock: order.stock_location_user_id === resellerId,
      is_her_sale: order.seller_id === resellerId,
    };
  }
}
