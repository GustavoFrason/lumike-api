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
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { CreateOrderDto } from './dto/create-order.dto';
import type { AuthUser } from '../auth/types/auth-user.type';
import { SettingsService } from '../settings/settings.service';
import { extractInsufficientStockMessage } from '../common/utils/stock-error.util';

type OrderStatus = Database['public']['Enums']['order_status'];

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
        p_seller_id: createOrderDto.seller_id || null,
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
        p_stock_location_user_id: createOrderDto.stock_location_user_id ?? null,
        p_items: createOrderDto.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        p_paid_now: amountToRecord > 0 ? amountToRecord : null,
        p_cash_user_id: user?.sub ?? null,
        p_lead_id: leadId,
        p_receiver_name: user?.email ?? null,
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

  async findAll(page = 1, limit = 50, status?: string, customerId?: number) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('orders')
      .select(
        `
        *,
        customers:customer_id (
          id,
          name,
          email,
          phone
        )
      `,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status && isValidOrderStatus(status))
      query = query.eq('status', status);
    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error, count } = await query;
    if (error)
      throw new InternalServerErrorException(
        `Erro ao listar pedidos: ${error.message}`,
      );

    return {
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    };
  }

  async findOne(id: number) {
    const { data: order, error: orderError } = await this.supabase
      .from('orders')
      .select(
        `
        *,
        customers:customer_id (
          id,
          name,
          email,
          phone
        )
      `,
      )
      .eq('id', id)
      .single();

    if (orderError || !order)
      throw new NotFoundException(`Pedido #${id} não encontrado`);

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
}
