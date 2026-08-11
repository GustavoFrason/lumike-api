/**
 * DashboardService
 * --------------------
 * Responsável por buscar dados do dashboard.
 *
 * O saldo "moderno" (cash_flow) é sempre obtido via CashFlowService — fonte
 * única de verdade para saldo de caixa (ver cash-flow.service.ts) — em vez
 * de cada service reconsultar a tabela `cash_flow` cru e reimplementar a
 * mesma soma.
 *
 * A lógica de faturamento "legado" (pedidos anteriores à migração para
 * cash_flow, ver MIGRATION_DATE) é isolada em fetchLegacyData/
 * legacyOrderContribution, usados tanto por getKPIs quanto por
 * getRevenueHistory — antes era o mesmo cálculo copiado duas vezes.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { CashFlowService } from '../cash-flow/cash-flow.service';

interface LegacyOrderRow {
  id: number;
  created_at: string;
  total_amount: number;
  boca_paid_now?: number | null;
  payment_status?: string | null;
  status: string;
}

interface LegacyPaymentRow {
  order_id: number;
  amount: number;
  created_at: string;
  type?: string;
}

interface TopSellerItemRow {
  product_id: number;
  quantity: number | null;
  products: { name: string } | null;
}

interface TopSellerAccumulator {
  product_id: number;
  name: string;
  qty_90d: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
    private readonly cashFlowService: CashFlowService,
  ) {}

  /**
   * Ponto de corte da migração para o sistema de fluxo de caixa (cash_flow).
   * Pedidos/pagamentos anteriores a essa data não têm lançamento em
   * cash_flow e precisam ser somados a partir de `orders`/`order_payments`
   * diretamente — esse é o único motivo de existir a lógica "legada" abaixo.
   * TODO: remover esse bridge quando o histórico pré-migração deixar de ser
   * relevante para os KPIs (ex: após 1 ano rolante).
   */
  private readonly MIGRATION_DATE = '2026-01-10T00:00:00Z';

  /**
   * Busca KPIs do dashboard
   */
  async getKPIs() {
    return this.calculateKPIs();
  }

  private async calculateKPIs() {
    const [{ balance: cashFlowNet }, legacyTotal] = await Promise.all([
      this.cashFlowService.getBalance(),
      this.calculateLegacyTotal(),
    ]);

    const totalVendas = cashFlowNet + legacyTotal;

    const { data: ordersCountData } = await this.supabase
      .from('orders')
      .select('id')
      .neq('status', 'cancelled');
    const totalPedidosCount = ordersCountData?.length || 0;

    const { count: produtosAtivos } = await this.supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    const { count: clientes } = await this.supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    const { count: leadsCount } = await this.supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });
    const { count: leadsConvertidos } = await this.supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('is_used', true);

    return {
      total_vendas: totalVendas,
      total_pedidos: totalPedidosCount,
      produtos_ativos: produtosAtivos || 0,
      clientes: clientes || 0,
      total_leads: leadsCount || 0,
      ticket_medio: totalPedidosCount > 0 ? totalVendas / totalPedidosCount : 0,
      // % de leads que de fato usaram o cupom numa venda (leads.is_used).
      // Antes era total_pedidos / leads — número sem sentido, já que a
      // maioria das vendas é PDV/balcão e não vem de lead nenhum (dava
      // 1500% com 15 pedidos e 1 lead, achado auditando o Dashboard).
      taxa_conversao:
        (leadsCount || 0) > 0
          ? ((leadsConvertidos || 0) / (leadsCount || 1)) * 100
          : 0,
    };
  }

  /**
   * Busca produtos mais vendidos (últimos 90 dias)
   */
  async getTopSellers(limit: number = 5) {
    const { data, error } = await this.supabase
      .from('vw_top_sellers_90d')
      .select('*')
      .limit(limit);

    if (error) {
      this.logger.warn(
        `vw_top_sellers_90d indisponível, recalculando via order_items: ${error.message}`,
      );
      return this.calculateTopSellers(limit);
    }
    return data || [];
  }

  private async calculateTopSellers(limit: number) {
    const { data } = await this.supabase
      .from('order_items')
      .select(
        `
        product_id,
        quantity,
        orders!inner(created_at, status),
        products!inner(name)
      `,
      )
      .gte(
        'orders.created_at',
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .in('orders.status', ['paid', 'completed', 'parcelado_boca']);

    if (!data) return [];

    const rows = data as unknown as TopSellerItemRow[];
    const grouped = rows.reduce<Record<number, TopSellerAccumulator>>(
      (acc, item) => {
        const productId = item.product_id;
        if (!acc[productId]) {
          acc[productId] = {
            product_id: productId,
            name: item.products?.name || 'Produto',
            qty_90d: 0,
          };
        }
        acc[productId].qty_90d += item.quantity || 0;
        return acc;
      },
      {},
    );

    return Object.values(grouped)
      .sort((a, b) => b.qty_90d - a.qty_90d)
      .slice(0, limit);
  }

  async getLowStockAlerts(limit: number = 10) {
    const { data: products } = await this.supabase
      .from('products')
      .select('id, name, sku, current_stock, min_stock')
      .eq('is_active', true)
      .limit(limit);
    const lowStock = (products || [])
      .filter((p) => p.current_stock < p.min_stock)
      .map((p) => ({
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        current_stock: p.current_stock,
        min_stock: p.min_stock,
        missing: Math.max(0, p.min_stock - p.current_stock),
      }))
      .sort((a, b) => b.missing - a.missing)
      .slice(0, limit);
    return lowStock;
  }

  /**
   * Busca histórico de faturamento dos últimos 30 dias (cash_flow moderno +
   * bridge legado para o período que ainda cai antes de MIGRATION_DATE).
   */
  async getRevenueHistory() {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const dailyRevenue: Record<string, number> = {};

    const { data: cashFlow } = await this.supabase
      .from('cash_flow')
      .select('type, amount, created_at')
      .gte('created_at', thirtyDaysAgo);

    cashFlow?.forEach((entry) => {
      const date = new Date(entry.created_at ?? Date.now())
        .toISOString()
        .split('T')[0];
      const val = Number(entry.amount);
      dailyRevenue[date] =
        (dailyRevenue[date] || 0) + (entry.type === 'IN' ? val : -val);
    });

    const { orders, payments, paidOrderIds } =
      await this.fetchLegacyData(thirtyDaysAgo);

    orders.forEach((order) => {
      const date = new Date(order.created_at).toISOString().split('T')[0];
      const contribution = this.legacyOrderContribution(order, paidOrderIds);
      if (contribution !== 0) {
        dailyRevenue[date] = (dailyRevenue[date] || 0) + contribution;
      }
    });

    payments.forEach((p) => {
      const date = new Date(p.created_at).toISOString().split('T')[0];
      const val = Number(p.amount);
      dailyRevenue[date] =
        (dailyRevenue[date] || 0) + (p.type === 'refund' ? -val : val);
    });

    const history: { date: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      history.push({
        date: dateStr,
        revenue: Number(Number(dailyRevenue[dateStr] || 0).toFixed(2)),
      });
    }

    return history;
  }

  /** Soma total do bridge legado (sem limite de data) — usado só pelos KPIs. */
  private async calculateLegacyTotal(): Promise<number> {
    const { orders, payments, paidOrderIds } = await this.fetchLegacyData();
    const ordersTotal = orders.reduce(
      (sum, order) => sum + this.legacyOrderContribution(order, paidOrderIds),
      0,
    );
    const paymentsTotal = payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    return ordersTotal + paymentsTotal;
  }

  /** Busca pedidos e pagamentos anteriores a MIGRATION_DATE, opcionalmente a partir de `sinceDate`. */
  private async fetchLegacyData(sinceDate?: string): Promise<{
    orders: LegacyOrderRow[];
    payments: LegacyPaymentRow[];
    paidOrderIds: Set<number>;
  }> {
    let ordersQuery = this.supabase
      .from('orders')
      .select(
        'id, created_at, total_amount, boca_paid_now, payment_status, status',
      )
      .lt('created_at', this.MIGRATION_DATE)
      .neq('status', 'cancelled');
    if (sinceDate) ordersQuery = ordersQuery.gte('created_at', sinceDate);

    let paymentsQuery = this.supabase
      .from('order_payments')
      .select('order_id, amount, created_at, type')
      .lt('created_at', this.MIGRATION_DATE);
    if (sinceDate) paymentsQuery = paymentsQuery.gte('created_at', sinceDate);

    const [{ data: orders }, { data: payments }] = await Promise.all([
      ordersQuery,
      paymentsQuery,
    ]);
    // order_id é nullable no schema (pagamento avulso sem pedido vinculado);
    // filtramos antes de montar o Set<number>.
    const paidOrderIds = new Set(
      (payments ?? [])
        .map((p) => p.order_id)
        .filter((id): id is number => id !== null),
    );

    return {
      orders: orders ?? [],
      payments: (payments ?? []) as LegacyPaymentRow[],
      paidOrderIds,
    };
  }

  /**
   * Valor que um pedido "legado" contribui para o faturamento: o sinal
   * (boca_paid_now) sempre conta; o valor total só entra se o pedido está
   * marcado como pago, não tinha sinal, e ainda não tem um registro em
   * order_payments (evita contar o mesmo valor duas vezes).
   */
  private legacyOrderContribution(
    order: LegacyOrderRow,
    paidOrderIds: Set<number>,
  ): number {
    let contribution = 0;
    if (order.boca_paid_now) contribution += Number(order.boca_paid_now);

    const isPaid =
      order.payment_status === 'pago' ||
      (!order.payment_status &&
        (order.status === 'paid' || order.status === 'completed'));

    if (isPaid && !order.boca_paid_now && !paidOrderIds.has(order.id)) {
      contribution += Number(order.total_amount || 0);
    }
    return contribution;
  }
}
