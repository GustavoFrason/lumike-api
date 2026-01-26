/**
 * DashboardService
 * --------------------
 * Responsável por buscar dados do dashboard.
 */

import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DashboardService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) { }

  private readonly MIGRATION_DATE = '2026-01-10T00:00:00Z';

  /**
   * Busca KPIs do dashboard
   */
  async getKPIs() {
    return this.calculateKPIs();
  }

  /**
   * Calcula KPIs manualmente (Hybrid Logic: Legacy + Cash Flow)
   */
  private async calculateKPIs() {
    // 1. New Source: Cash Flow (Real Money)
    const { data: cashFlow } = await this.supabase
      .from('cash_flow')
      .select('type, amount');

    const cashFlowNet = cashFlow?.reduce((sum, entry) => {
      return entry.type === 'IN' ? sum + Number(entry.amount) : sum - Number(entry.amount);
    }, 0) || 0;

    // 2. Legacy Source: Orders/Payments created BEFORE migration
    const { data: legacyOrders } = await this.supabase
      .from('orders')
      .select('id, total_amount, boca_paid_now, payment_status, status')
      .lt('created_at', this.MIGRATION_DATE)
      .neq('status', 'cancelled');

    const { data: legacyPayments } = await this.supabase
      .from('order_payments')
      .select('order_id, amount')
      .lt('created_at', this.MIGRATION_DATE);

    const legacyOrdersWithPayments = new Set(legacyPayments?.map(p => p.order_id) || []);

    const legacyTotal = (legacyOrders?.reduce((sum, order) => {
      if (order.boca_paid_now) sum += Number(order.boca_paid_now);

      const isPaid = order.payment_status === 'pago' ||
        (!order.payment_status && (order.status === 'paid' || order.status === 'completed'));

      if (isPaid && !order.boca_paid_now && !legacyOrdersWithPayments.has(order.id)) {
        sum += Number(order.total_amount || 0);
      }
      return sum;
    }, 0) || 0) + (legacyPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0);

    const totalVendas = cashFlowNet + legacyTotal;

    // Order Count (excluding cancelled)
    const { data: ordersCountData } = await this.supabase
      .from('orders')
      .select('id')
      .neq('status', 'cancelled');

    const totalPedidosCount = ordersCountData?.length || 0;

    // Remaining KPIs
    const { count: produtosAtivos } = await this.supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: clientes } = await this.supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: leadsCount } = await this.supabase.from('leads').select('*', { count: 'exact', head: true });

    return {
      total_vendas: totalVendas,
      total_pedidos: totalPedidosCount,
      produtos_ativos: produtosAtivos || 0,
      clientes: clientes || 0,
      total_leads: leadsCount || 0,
      ticket_medio: totalPedidosCount > 0 ? totalVendas / totalPedidosCount : 0,
      taxa_conversao: (leadsCount || 0) > 0 ? (totalPedidosCount / (leadsCount || 1)) * 100 : 0
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

    if (error) return this.calculateTopSellers(limit);
    return data || [];
  }

  private async calculateTopSellers(limit: number) {
    const { data } = await this.supabase
      .from('order_items')
      .select(`
        product_id,
        quantity,
        orders!inner(created_at, status),
        products!inner(name)
      `)
      .gte('orders.created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .in('orders.status', ['paid', 'completed', 'parcelado_boca']); // Added new status

    if (!data) return [];

    const grouped = data.reduce((acc: any, item) => {
      const productId = item.product_id;
      if (!acc[productId]) {
        acc[productId] = {
          product_id: productId,
          name: (item.products as any)?.name || 'Produto',
          qty_90d: 0,
        };
      }
      acc[productId].qty_90d += item.quantity || 0;
      return acc;
    }, {});

    return Object.values(grouped).sort((a: any, b: any) => b.qty_90d - a.qty_90d).slice(0, limit);
  }

  async getLowStockAlerts(limit: number = 10) {
    const { data: products } = await this.supabase.from('products').select('id, name, sku, current_stock, min_stock').eq('is_active', true).limit(limit);
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
   * Busca histórico de faturamento (Hybrid Logic)
   */
  async getRevenueHistory() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Cash Flow Entries (Modern)
    const { data: cashFlow } = await this.supabase
      .from('cash_flow')
      .select('type, amount, created_at')
      .gte('created_at', thirtyDaysAgo);

    // 2. Legacy Orders/Payments
    const { data: orders } = await this.supabase
      .from('orders')
      .select('id, created_at, total_amount, boca_paid_now, payment_status, status')
      .lt('created_at', this.MIGRATION_DATE)
      .gte('created_at', thirtyDaysAgo)
      .neq('status', 'cancelled');

    const { data: payments } = await this.supabase
      .from('order_payments')
      .select('order_id, amount, created_at, type')
      .lt('created_at', this.MIGRATION_DATE)
      .gte('created_at', thirtyDaysAgo);

    const legacyOrdersWithPayments = new Set(payments?.map(p => p.order_id) || []);

    const dailyRevenue: Record<string, number> = {};

    // Process Cash Flow
    cashFlow?.forEach(entry => {
      const date = new Date(entry.created_at).toISOString().split('T')[0];
      const val = Number(entry.amount);
      if (entry.type === 'IN') dailyRevenue[date] = (dailyRevenue[date] || 0) + val;
      else dailyRevenue[date] = (dailyRevenue[date] || 0) - val;
    });

    // Process Legacy Orders
    orders?.forEach(order => {
      const date = new Date(order.created_at).toISOString().split('T')[0];
      if (order.boca_paid_now) dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(order.boca_paid_now);

      const isPaid = order.payment_status === 'pago' || (!order.payment_status && (order.status === 'paid' || order.status === 'completed'));
      if (isPaid && !order.boca_paid_now && !legacyOrdersWithPayments.has(order.id)) {
        dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(order.total_amount || 0);
      }
    });

    // Process Legacy Payments
    payments?.forEach(p => {
      const date = new Date(p.created_at).toISOString().split('T')[0];
      const val = Number(p.amount);
      if (p.type === 'refund') dailyRevenue[date] = (dailyRevenue[date] || 0) - val;
      else dailyRevenue[date] = (dailyRevenue[date] || 0) + val;
    });

    // Fill Gaps
    const history: { date: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      history.push({
        date: dateStr,
        revenue: Number(Number(dailyRevenue[dateStr] || 0).toFixed(2))
      });
    }

    return history;
  }
}
