/**
 * OrdersService
 * --------------------
 * Responsável por operações CRUD de pedidos/vendas no Supabase.
 */

import { Injectable, Inject, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateOrderDto } from './dto/create-order.dto';

import { InventoryService } from '../inventory/inventory.service';
import { CashFlowService } from '../cash-flow/cash-flow.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class OrdersService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    private readonly inventoryService: InventoryService,
    private readonly cashFlowService: CashFlowService,
    private readonly settingsService: SettingsService,
  ) {
    console.log('[OrdersService] Injetado:', {
      supabase: !!this.supabase,
      inventory: !!this.inventoryService,
      cashFlow: !!this.cashFlowService,
      settings: !!this.settingsService
    });
  }

  /**
   * Cria um novo pedido
   */
  async create(createOrderDto: CreateOrderDto, user?: any) {
    try {
      console.log('🏁 [OrdersService.create] Início:', { itemsCount: createOrderDto.items?.length, customerId: createOrderDto.customer_id });
      // Calcula o total do pedido
      const totalAmount = createOrderDto.items.reduce(
        (sum, item) => sum + item.unit_price * item.quantity,
        0,
      );

      // Validação de Cupom
      let discountAmount = 0;
      let leadIdToUpdate: number | null = null;

      if (createOrderDto.couponCode) {
        const { data: lead, error: leadError } = await this.supabase
          .from('leads')
          .select('*')
          .eq('coupon_code', createOrderDto.couponCode)
          .eq('is_used', false)
          .maybeSingle();

        if (leadError || !lead) {
          throw new BadRequestException('Cupom inválido ou já utilizado.');
        }

        const discountPercent = await this.settingsService.getNumber('coupon_discount_percent', 0.10);
        discountAmount = totalAmount * discountPercent;
        leadIdToUpdate = lead.id;
      }

      const finalTotal = totalAmount - discountAmount;

      console.log('📝 [OrdersService.create] Payload de inserção preparado:', {
        mainStatus: 'pending', // Initial value before determining
        finalTotal,
        userId: user?.sub
      });

      // Determine main status based on payment status
      // Concluído: Pago e Entregue
      // Parcelado Boca: Tem saldo pendente
      let mainStatus = 'pending';
      if (createOrderDto.payment_status === 'pago') {
        mainStatus = 'completed';
      } else if (createOrderDto.payment_status === 'parcial' || createOrderDto.payment_method === 'boca') {
        mainStatus = 'parcelado_boca';
      }

      // Cria o pedido
      const { data: insertedData, error: orderError } = await this.supabase
        .from('orders')
        .insert({
          customer_id: createOrderDto.customer_id || null,
          status: mainStatus,
          payment_method: createOrderDto.payment_method,
          payment_status: createOrderDto.payment_status,
          boca_value: createOrderDto.boca_details?.value,
          boca_paid_now: createOrderDto.boca_details?.paid_now || 0,
          boca_notes: createOrderDto.boca_details?.notes,
          card_brand: createOrderDto.card_details?.brand,
          card_tax: createOrderDto.card_details?.tax,
          transaction_id: createOrderDto.card_details?.transaction_id,
          total_amount: finalTotal,
          notes: createOrderDto.notes ? `${createOrderDto.notes} | Cupom: ${createOrderDto.couponCode || ''} (-R$${discountAmount.toFixed(2)})` : `Cupom: ${createOrderDto.couponCode || ''} (-R$${discountAmount.toFixed(2)})`,
        })
        .select();

      if (orderError) {
        console.error('❌ [OrdersService] Erro Supabase ao criar pedido:', orderError);
        throw new InternalServerErrorException(`Erro ao criar pedido: ${orderError.message}`);
      }

      const order = insertedData?.[0];

      if (!order) {
        console.error('❌ [OrdersService] Pedido criado mas não retornado pelo Supabase (insertedData is empty)');
        throw new InternalServerErrorException('Erro ao recuperar dados do pedido criado.');
      }

      console.log('✅ [OrdersService.create] Pedido base criado ID:', order.id);

      // Se houve pagamento inicial (sinal) ou pagamento total, registra no Fluxo de Caixa
      const paidNow = createOrderDto.boca_details?.paid_now || 0;
      if (paidNow > 0 || createOrderDto.payment_status === 'pago') {
        const amountToRecord = createOrderDto.payment_status === 'pago' ? finalTotal : paidNow;
        try {
          console.log('💰 [OrdersService.create] Registrando fluxo de caixa:', { amountToRecord });
          await this.cashFlowService.createEntry({
            type: 'IN',
            category: 'venda',
            amount: amountToRecord,
            description: `Pagamento inicial Pedido #${order.id}`,
            order_id: order.id,
            user_id: user?.sub,
          });
        } catch (e) {
          console.error('❌ [OrdersService] Erro ao registrar fluxo de caixa inicial:', e.message);
        }
      }

      // Marcar cupom como usado
      if (leadIdToUpdate) {
        console.log('🎫 [OrdersService.create] Marcando cupom como usado:', leadIdToUpdate);
        await this.supabase.from('leads').update({ is_used: true }).eq('id', leadIdToUpdate);
      }

      // Cria os itens
      console.log('📦 [OrdersService.create] Criando itens do pedido...');
      const orderItems = createOrderDto.items.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      const { error: itemsError } = await this.supabase.from('order_items').insert(orderItems);
      if (itemsError) {
        console.error('❌ [OrdersService.create] Erro ao criar itens:', itemsError);
        await this.supabase.from('orders').delete().eq('id', order.id);
        throw new InternalServerErrorException(`Erro ao criar itens: ${itemsError.message}`);
      }

      // Baixa estoque
      console.log('📉 [OrdersService.create] Baixando estoque...');
      for (const item of createOrderDto.items) {
        try {
          await this.inventoryService.removeStock(item.product_id, {
            quantity: item.quantity,
            reference: `order:${order.id}`,
          });
        } catch (error) {
          console.error(`❌ [OrdersService.create] Erro ao atualizar estoque do produto ${item.product_id}:`, error);
        }
      }

      console.log('🏁 [OrdersService.create] Finalizado com sucesso!');
      return this.findOne(order.id);
    } catch (error) {
      console.error('❌ [OrdersService] Erro inesperado ao criar pedido:', error);
      if (error instanceof InternalServerErrorException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Erro interno: ${error.message}`);
    }
  }

  async findAll(page = 1, limit = 50, status?: string, customerId?: number) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('orders')
      .select(`
        *,
        customers:customer_id (
          id,
          name,
          email,
          phone
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);
    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error, count } = await query;
    if (error) throw new InternalServerErrorException(`Erro ao listar pedidos: ${error.message}`);

    return {
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    };
  }

  async findOne(id: number) {
    const { data: order, error: orderError } = await this.supabase
      .from('orders')
      .select(`
        *,
        customers:customer_id (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('id', id)
      .single();

    if (orderError || !order) throw new NotFoundException(`Pedido #${id} não encontrado`);

    const { data: items } = await this.supabase
      .from('order_items')
      .select('*, products:product_id(id, name, sku)')
      .eq('order_id', id);

    return { ...order, items: items || [] };
  }

  async updateStatus(id: number, status: string) {
    await this.findOne(id);
    const validStatuses = ['pending', 'paid', 'completed', 'cancelled', 'parcelado_boca'];
    if (!validStatuses.includes(status)) throw new BadRequestException(`Status inválido: ${status}`);

    const { data, error } = await this.supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single();

    if (error) throw new InternalServerErrorException(`Erro: ${error.message}`);
    return data;
  }

  /**
   * Cancelamento Avançado com Estorno
   */
  async cancelOrder(id: number, details: { refundAmount: number; notes: string; user?: any }) {
    const order = await this.findOne(id);
    if (order.status === 'cancelled') throw new BadRequestException('Pedido já está cancelado.');

    // 1. Atualiza status do pedido
    const { error: updateError } = await this.supabase
      .from('orders')
      .update({
        status: 'cancelled',
        notes: `${order.notes || ''} | CANCELADO: ${details.notes} (Estorno: R$${details.refundAmount})`,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw new InternalServerErrorException(updateError.message);

    // 2. Registra estorno no Fluxo de Caixa (se houve devolução de dinheiro)
    if (details.refundAmount > 0) {
      await this.cashFlowService.createEntry({
        type: 'OUT',
        category: 'estorno',
        amount: details.refundAmount,
        description: `Estorno Pedido #${id}: ${details.notes}`,
        order_id: id,
        user_id: details.user?.sub // Standardized to use 'sub' from JWT payload
      });

      // Log em order_payments
      await this.supabase.from('order_payments').insert({
        order_id: id,
        amount: details.refundAmount,
        payment_method: 'estorno',
        type: 'refund',
        notes: details.notes,
        receiver_name: details.user?.name || 'Sistema'
      });
    }

    // 3. Devolver estoque
    for (const item of order.items) {
      try {
        await this.inventoryService.addStock(item.product_id, {
          quantity: item.quantity,
          reference: `order-cancel:${id}`,
        });
      } catch (e) {
        console.error('Erro ao devolver estoque:', e.message);
      }
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
