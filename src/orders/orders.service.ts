/**
 * OrdersService
 * --------------------
 * Responsável por operações CRUD de pedidos/vendas no Supabase.
 *
 * Criação e cancelamento delegam para funções atômicas no Postgres
 * (fn_create_order / fn_cancel_order — ver migration
 * 20260804_atomic_stock_and_orders.sql). Antes, `create()` fazia 4+
 * chamadas HTTP sequenciais (inserir pedido, lançar caixa, inserir itens,
 * dar baixa de estoque item a item) sem transação: se a baixa de estoque
 * falhasse no meio do loop, o erro só era logado e o pedido seguia como se
 * nada tivesse acontecido, deixando o estoque divergente do que foi
 * realmente vendido. Com a função no banco, ou tudo é gravado, ou nada é.
 */

import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetOrdersFilterDto } from './dto/get-orders-filter.dto';
import type { AuthUser } from '../auth/types/auth-user.type';
import { StaffRole } from '../auth/enums/role.enum';
import { SettingsService } from '../settings/settings.service';
import { extractInsufficientStockMessage } from '../common/utils/stock-error.util';
import { CASH_FLOW_START_DATE } from '../common/constants';
import {
  saoPauloNoon,
  saoPauloRange,
  todayInSaoPaulo,
} from '../common/utils/sao-paulo-date.util';
import { fetchAllPages } from '../common/utils/fetch-all-pages.util';

type OrderStatus = Database['public']['Enums']['order_status'];

const ORDER_LIST_SELECT = `
  *,
  customers:customer_id (id, name, email, phone),
  seller:users!orders_seller_id_fkey (id, name),
  stock_location:users!orders_stock_location_user_id_fkey (id, name)
` as const;

/** Formas de pagamento que deixam saldo em aberto (fiado). */
const ON_CREDIT_PAYMENT_STATUSES = ['parcial', 'aberto'];

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Revendedora (papel vendedor): toda conta vendedor tem "mala" própria. */
function isReseller(user?: AuthUser): user is AuthUser {
  return user?.role === StaffRole.VENDEDOR;
}

/** Filtros já interpretados (ver GetOrdersFilterDto). */
interface ResolvedOrderFilters {
  status?: OrderStatus;
  customerId?: number;
  sellerId?: number | null; // null = sem vendedora (loja)
  stockLocation?: number | null; // null = Estoque Central
  range: { gte?: string; lt?: string };
  /** Revendedora logada: só as vendas dela (comissão ou da mala dela). */
  ownerId?: number;
}

export interface SellerSummary {
  /** null = vendas da loja (sem vendedora ou vendidas por admin/gestor). */
  seller_id: number | null;
  name: string;
  orders_count: number;
  total: number;
  commission_rate: number;
  commission: number;
}

export interface StockLocationSummary {
  /** null = Estoque Central. */
  user_id: number | null;
  name: string;
  orders_count: number;
  total: number;
}

export interface OrdersSummary {
  totals: { orders_count: number; total: number; commission: number };
  by_seller: SellerSummary[];
  by_stock_location: StockLocationSummary[];
}

const VALID_ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'paid',
  'completed',
  'cancelled',
  'parcelado_boca',
];

function isValidOrderStatus(value: string): value is OrderStatus {
  return (VALID_ORDER_STATUSES as readonly string[]).includes(value);
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Cria um novo pedido: pedido + itens + baixa de estoque + lançamento de
   * caixa (se houve pagamento) + baixa de cupom, tudo em uma transação
   * atômica via fn_create_order.
   */
  async create(createOrderDto: CreateOrderDto, user?: AuthUser) {
    let sellerId = createOrderDto.seller_id || null;
    let stockLocationUserId = createOrderDto.stock_location_user_id ?? null;

    if (isReseller(user)) {
      // Revendedora: a venda é SEMPRE dela e sai da mala dela — não confia
      // no que vier do front (antes dava pra creditar outra pessoa ou
      // baixar o estoque de qualquer um).
      if (createOrderDto.sale_date) {
        throw new ForbiddenException(
          'Só a gestão pode lançar venda com data passada.',
        );
      }
      if (
        createOrderDto.payment_method === 'boca' ||
        ON_CREDIT_PAYMENT_STATUSES.includes(createOrderDto.payment_status)
      ) {
        throw new BadRequestException(
          'Venda fiado (boca/aberto) não pode ser lançada pela revendedora.',
        );
      }
      sellerId = user.sub;
      stockLocationUserId = user.sub;
    }

    const saleDate = this.resolveSaleDate(createOrderDto.sale_date);
    // Venda da mala de uma revendedora: o dinheiro fica com ela e só entra
    // no caixa da loja no acerto (senão o caixa contaria duas vezes).
    const recordCash = stockLocationUserId === null;

    const totalAmount = createOrderDto.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0,
    );

    // Validação de cupom
    let discountAmount = 0;
    let leadId: string | null = null;

    if (createOrderDto.couponCode) {
      const { data: lead, error: leadError } = await this.supabase
        .from('leads')
        .select('id')
        .eq('coupon_code', createOrderDto.couponCode)
        .eq('is_used', false)
        .maybeSingle();

      if (leadError || !lead) {
        throw new BadRequestException('Cupom inválido ou já utilizado.');
      }

      const discountPercent = await this.settingsService.getNumber(
        'coupon_discount_percent',
        0.1,
      );
      discountAmount = totalAmount * discountPercent;
      leadId = lead.id;
    }

    const finalTotal = totalAmount - discountAmount;

    // Concluído: pago e entregue. Parcelado boca: tem saldo pendente.
    let mainStatus: 'pending' | 'completed' | 'parcelado_boca' = 'pending';
    if (createOrderDto.payment_status === 'pago') {
      mainStatus = 'completed';
    } else if (
      createOrderDto.payment_status === 'parcial' ||
      createOrderDto.payment_method === 'boca'
    ) {
      mainStatus = 'parcelado_boca';
    }

    const paidNow = createOrderDto.boca_details?.paid_now || 0;
    const amountToRecord =
      createOrderDto.payment_status === 'pago' ? finalTotal : paidNow;

    // boca_value é o SALDO DEVEDOR (o que ainda falta pagar), não o valor
    // total da venda. Se o sinal (paid_now) não for descontado aqui, a
    // dívida do cliente fica sempre superestimada em contas a receber —
    // bug real achado auditando o fluxo (venda de R$39,99 com R$10 de sinal
    // aparecia como R$39,99 de dívida, não R$29,99).
    const bocaValue =
      createOrderDto.boca_details?.value !== undefined
        ? Math.max(0, createOrderDto.boca_details.value - paidNow)
        : null;

    const couponSuffix = createOrderDto.couponCode
      ? ` | Cupom: ${createOrderDto.couponCode} (-R$${discountAmount.toFixed(2)})`
      : '';
    const notes = `${createOrderDto.notes || ''}${couponSuffix}`.trim() || null;

    const { data: orderId, error } = await this.supabase.rpc(
      'fn_create_order',
      {
        p_customer_id: createOrderDto.customer_id || null,
        p_seller_id: sellerId,
        p_status: mainStatus,
        p_payment_method: createOrderDto.payment_method,
        p_payment_status: createOrderDto.payment_status,
        p_total_amount: finalTotal,
        p_notes: notes,
        p_boca_value: bocaValue,
        p_boca_paid_now: createOrderDto.boca_details?.paid_now ?? 0,
        p_boca_notes: createOrderDto.boca_details?.notes ?? null,
        p_card_brand: createOrderDto.card_details?.brand ?? null,
        p_card_tax: createOrderDto.card_details?.tax ?? null,
        p_transaction_id: createOrderDto.card_details?.transaction_id ?? null,
        p_installments: createOrderDto.card_details?.installments ?? null,
        p_stock_location_user_id: stockLocationUserId,
        p_items: createOrderDto.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        p_paid_now: amountToRecord > 0 ? amountToRecord : null,
        p_cash_user_id: user?.sub ?? null,
        p_lead_id: leadId,
        p_receiver_name: user?.email ?? null,
        p_sale_date: saleDate,
        p_record_cash: recordCash,
      },
    );

    if (error) {
      if (error.message?.includes('INSUFFICIENT_STOCK')) {
        throw new BadRequestException(
          extractInsufficientStockMessage(error.message),
        );
      }
      this.logger.error(`Erro ao criar pedido: ${error.message}`, error);
      throw new InternalServerErrorException(
        `Erro ao criar pedido: ${error.message}`,
      );
    }

    this.logger.log(`Pedido #${orderId} criado com sucesso.`);
    return this.findOne(orderId);
  }

  /**
   * Lista vendas com filtros de período (calendário de São Paulo),
   * vendedora e estoque de origem. A revendedora só vê as próprias vendas.
   */
  async findAll(filters: GetOrdersFilterDto = {}, user?: AuthUser) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const f = this.resolveFilters(filters, user);

    let query = this.supabase
      .from('orders')
      .select(ORDER_LIST_SELECT, { count: 'exact' });

    if (f.status) query = query.eq('status', f.status);
    if (f.customerId) query = query.eq('customer_id', f.customerId);
    if (f.sellerId === null) query = query.is('seller_id', null);
    else if (f.sellerId !== undefined)
      query = query.eq('seller_id', f.sellerId);
    if (f.stockLocation === null)
      query = query.is('stock_location_user_id', null);
    else if (f.stockLocation !== undefined)
      query = query.eq('stock_location_user_id', f.stockLocation);
    if (f.range.gte) query = query.gte('created_at', f.range.gte);
    if (f.range.lt) query = query.lt('created_at', f.range.lt);
    if (f.ownerId !== undefined)
      query = query.or(
        `seller_id.eq.${f.ownerId},stock_location_user_id.eq.${f.ownerId}`,
      );

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error)
      throw new InternalServerErrorException(
        `Erro ao listar pedidos: ${error.message}`,
      );

    return {
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    };
  }

  /**
   * Totais por vendedora (com comissão) e por estoque de origem no
   * período, sem vendas canceladas. "Loja" agrupa venda sem vendedora ou
   * feita por admin/gestor. Calculado no servidor sobre TODAS as vendas do
   * período (a tela de comissões fazia isso no navegador com no máximo
   * 1000 pedidos).
   */
  async summary(
    filters: GetOrdersFilterDto = {},
    user?: AuthUser,
  ): Promise<OrdersSummary> {
    const f = this.resolveFilters(filters, user);

    type SummaryRow = {
      id: number;
      total_amount: number;
      seller_id: number | null;
      stock_location_user_id: number | null;
    };

    let rows: SummaryRow[];
    try {
      rows = await fetchAllPages<SummaryRow>((from, to) => {
        let query = this.supabase
          .from('orders')
          .select('id, total_amount, seller_id, stock_location_user_id')
          .neq('status', 'cancelled');

        if (f.customerId) query = query.eq('customer_id', f.customerId);
        if (f.sellerId === null) query = query.is('seller_id', null);
        else if (f.sellerId !== undefined)
          query = query.eq('seller_id', f.sellerId);
        if (f.stockLocation === null)
          query = query.is('stock_location_user_id', null);
        else if (f.stockLocation !== undefined)
          query = query.eq('stock_location_user_id', f.stockLocation);
        if (f.range.gte) query = query.gte('created_at', f.range.gte);
        if (f.range.lt) query = query.lt('created_at', f.range.lt);
        if (f.ownerId !== undefined)
          query = query.or(
            `seller_id.eq.${f.ownerId},stock_location_user_id.eq.${f.ownerId}`,
          );

        return query.order('id').range(from, to);
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Erro ao calcular resumo de vendas: ${(err as Error).message}`,
      );
    }

    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.seller_id, r.stock_location_user_id])
          .filter((id): id is number => id !== null),
      ),
    ];
    const users = await this.loadUsers(userIds);

    const bySeller = new Map<string, SellerSummary>();
    const byLocation = new Map<string, StockLocationSummary>();

    for (const row of rows) {
      const total = Number(row.total_amount) || 0;

      // Comissão só para quem é vendedora; o resto conta como "Loja".
      const seller =
        row.seller_id !== null ? users.get(row.seller_id) : undefined;
      const sellerKey = seller?.isReseller ? String(seller.id) : 'loja';
      const sellerEntry = bySeller.get(sellerKey) ?? {
        seller_id: seller?.isReseller ? seller.id : null,
        name: seller?.isReseller ? seller.name : 'Loja',
        orders_count: 0,
        total: 0,
        commission_rate: seller?.isReseller ? seller.commissionRate : 0,
        commission: 0,
      };
      sellerEntry.orders_count += 1;
      sellerEntry.total += total;
      bySeller.set(sellerKey, sellerEntry);

      const locationKey = String(row.stock_location_user_id ?? 'central');
      const locationUser =
        row.stock_location_user_id !== null
          ? users.get(row.stock_location_user_id)
          : undefined;
      const locationEntry = byLocation.get(locationKey) ?? {
        user_id: row.stock_location_user_id,
        name:
          row.stock_location_user_id === null
            ? 'Estoque Central'
            : (locationUser?.name ?? `Usuário #${row.stock_location_user_id}`),
        orders_count: 0,
        total: 0,
      };
      locationEntry.orders_count += 1;
      locationEntry.total += total;
      byLocation.set(locationKey, locationEntry);
    }

    const by_seller = [...bySeller.values()]
      .map((s) => ({
        ...s,
        total: round2(s.total),
        commission: round2((s.total * s.commission_rate) / 100),
      }))
      .sort((a, b) => b.total - a.total);

    const by_stock_location = [...byLocation.values()]
      .map((l) => ({ ...l, total: round2(l.total) }))
      .sort((a, b) => b.total - a.total);

    return {
      totals: {
        orders_count: rows.length,
        total: round2(by_seller.reduce((sum, s) => sum + s.total, 0)),
        commission: round2(by_seller.reduce((sum, s) => sum + s.commission, 0)),
      },
      by_seller,
      by_stock_location,
    };
  }

  /**
   * Detalhe da venda. Revendedora só abre as próprias vendas (as dela ou
   * as que saíram da mala dela) — recibo/certificado de garantia.
   */
  async findOne(id: number, user?: AuthUser) {
    const { data: order, error: orderError } = await this.supabase
      .from('orders')
      .select(ORDER_LIST_SELECT)
      .eq('id', id)
      .single();

    if (orderError || !order)
      throw new NotFoundException(`Pedido #${id} não encontrado`);

    if (
      isReseller(user) &&
      order.seller_id !== user.sub &&
      order.stock_location_user_id !== user.sub
    ) {
      throw new NotFoundException(`Pedido #${id} não encontrado`);
    }

    const { data: items } = await this.supabase
      .from('order_items')
      .select('*, products:product_id(id, name, sku)')
      .eq('order_id', id);

    return { ...order, items: items || [] };
  }

  async updateStatus(id: number, status: string) {
    await this.findOne(id);
    if (!isValidOrderStatus(status))
      throw new BadRequestException(`Status inválido: ${status}`);

    const { data, error } = await this.supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new InternalServerErrorException(`Erro: ${error.message}`);
    return data;
  }

  /**
   * Cancelamento com estorno: status + lançamento de estorno no caixa +
   * devolução de estoque, tudo em uma transação atômica via fn_cancel_order.
   */
  async cancelOrder(
    id: number,
    details: { refundAmount: number; notes: string; user?: AuthUser },
  ) {
    if (details.refundAmount > 0) {
      await this.assertRefundAllowed(id);
    }

    const { error } = await this.supabase.rpc('fn_cancel_order', {
      p_order_id: id,
      p_refund_amount: details.refundAmount ?? null,
      p_notes: details.notes ?? null,
      p_user_id: details.user?.sub ?? null,
      p_receiver_name: details.user?.email ?? 'Sistema',
    });

    if (error) {
      if (error.message?.includes('não encontrado')) {
        throw new NotFoundException(`Pedido #${id} não encontrado`);
      }
      if (error.message?.includes('já está cancelado')) {
        throw new BadRequestException('Pedido já está cancelado.');
      }
      this.logger.error(
        `Erro ao cancelar pedido #${id}: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException(
        `Erro ao cancelar pedido: ${error.message}`,
      );
    }

    return { success: true };
  }

  async remove(id: number) {
    await this.findOne(id);
    const { error } = await this.supabase.from('orders').delete().eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
    return { message: 'Removido com sucesso' };
  }

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------

  /**
   * Data da venda informada pela gestão → timestamp ao meio-dia em São
   * Paulo (null = agora). Não pode ser futura nem anterior ao início do
   * fluxo de caixa — antes disso o dashboard soma os pedidos pela ponte
   * legada e a venda seria contada duas vezes.
   */
  private resolveSaleDate(date?: string): string | null {
    if (!date) return null;

    const today = todayInSaoPaulo();
    if (date > today) {
      throw new BadRequestException('A data da venda não pode ser futura.');
    }
    if (date < CASH_FLOW_START_DATE) {
      throw new BadRequestException(
        `A data da venda não pode ser anterior a ${CASH_FLOW_START_DATE.split('-').reverse().join('/')}.`,
      );
    }
    return date === today ? null : saoPauloNoon(date);
  }

  private resolveFilters(
    filters: GetOrdersFilterDto,
    user?: AuthUser,
  ): ResolvedOrderFilters {
    const parseOptionalId = (value: string | undefined, nullToken: string) => {
      if (value === undefined) return undefined;
      return value === nullToken ? null : Number(value);
    };

    return {
      status:
        filters.status && isValidOrderStatus(filters.status)
          ? filters.status
          : undefined,
      customerId: filters.customer_id,
      sellerId: parseOptionalId(filters.seller_id, 'none'),
      stockLocation: parseOptionalId(filters.stock_location, 'central'),
      range: saoPauloRange(filters.date_from, filters.date_to),
      ownerId: isReseller(user) ? user.sub : undefined,
    };
  }

  /** Nome, comissão e se é vendedora, para o resumo. */
  private async loadUsers(ids: number[]) {
    const users = new Map<
      number,
      { id: number; name: string; commissionRate: number; isReseller: boolean }
    >();
    if (ids.length === 0) return users;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, name, commission_rate, roles:role_id (name)')
      .in('id', ids);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao carregar vendedoras: ${error.message}`,
      );
    }

    for (const u of data ?? []) {
      users.set(u.id, {
        id: u.id,
        name: u.name,
        commissionRate: Number(u.commission_rate ?? 20),
        isReseller: u.roles?.name === StaffRole.VENDEDOR,
      });
    }
    return users;
  }

  /**
   * Venda que saiu da mala de uma revendedora e não entrou no caixa (o
   * dinheiro ficou com ela): estorno pelo caixa da loja tiraria dinheiro
   * que a loja nunca recebeu. A revendedora devolve ao cliente; aqui se
   * cancela sem estorno.
   */
  private async assertRefundAllowed(orderId: number) {
    const orderRes = await this.supabase
      .from('orders')
      .select('id, stock_location_user_id')
      .eq('id', orderId)
      .maybeSingle();
    const order = orderRes?.data;
    if (!order?.stock_location_user_id) return;

    const cashRes = await this.supabase
      .from('cash_flow')
      .select('id')
      .eq('order_id', orderId)
      .eq('type', 'IN')
      .limit(1);
    if (cashRes?.data && cashRes.data.length > 0) return;

    throw new BadRequestException(
      'Esta venda saiu da mala de uma revendedora e o dinheiro ficou com ela: cancele sem estorno (a revendedora devolve ao cliente).',
    );
  }
}
