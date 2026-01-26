import { Injectable, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CashFlowService } from '../cash-flow/cash-flow.service';

export interface Debtor {
    customer_id: number;
    customer_name: string;
    customer_phone?: string;
    total_debt: number;
    orders_count: number;
    orders: any[];
}

@Injectable()
export class AccountsReceivableService {
    constructor(
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
        private readonly cashFlowService: CashFlowService,
    ) { }

    async getDebtors() {
        // Fetch unpaid orders
        const { data: orders, error } = await this.supabase
            .from('orders')
            .select(`
        id,
        created_at,
        total_amount,
        payment_method,
        payment_status,
        status,
        boca_value,
        boca_notes,
        customer_id,
        customers:customer_id (
          id,
          name,
          phone,
          cpf
        )
      `)
            .neq('payment_status', 'pago')
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(`Erro ao buscar devedores: ${error.message}`);
        }

        if (!orders || orders.length === 0) {
            return [];
        }

        const debtorsMap = new Map<number, Debtor>();

        orders.forEach((order: any) => {
            const customer = order.customers;

            if (!customer || !order.customer_id) return;

            // Calculate debt
            let debt = 0;
            if (order.payment_status === 'parcial' || order.payment_status === 'aberto' || !order.payment_status) {
                debt = order.boca_value !== null ? Number(order.boca_value) : Number(order.total_amount);
            }

            if (debt <= 0) return;

            if (!debtorsMap.has(customer.id)) {
                debtorsMap.set(customer.id, {
                    customer_id: customer.id,
                    customer_name: customer.name,
                    customer_phone: customer.phone,
                    total_debt: 0,
                    orders_count: 0,
                    orders: []
                });
            }

            const debtor = debtorsMap.get(customer.id)!;
            debtor.total_debt += debt;
            debtor.orders_count += 1;
            debtor.orders.push({
                id: order.id,
                date: order.created_at,
                amount: debt,
                method: order.payment_method,
                notes: order.boca_notes || order.notes,
                status: order.status
            });
        });

        return Array.from(debtorsMap.values());
    }

    async getOrderPayments(orderId: number) {
        const { data, error } = await this.supabase
            .from('order_payments')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Erro ao buscar histórico de pagamentos: ${error.message}`);
        }

        return data || [];
    }

    async markAsPaid(orderId: number, amountPaid: number, paymentMethod: string, user: any) {
        const { data: order } = await this.supabase.from('orders').select('*').eq('id', orderId).single();
        if (!order) throw new Error('Pedido não encontrado');

        let newPaymentStatus = order.payment_status;
        let newOrderStatus = order.status;
        let newBocaValue = Number(order.boca_value !== null ? order.boca_value : order.total_amount);

        const remaining = newBocaValue - amountPaid;

        if (remaining <= 0.01) {
            newPaymentStatus = 'pago';
            newOrderStatus = 'completed'; // Automaticamente "Concluído" quando quitar
            newBocaValue = 0;
        } else {
            newPaymentStatus = 'parcial';
            newOrderStatus = 'parcelado_boca'; // Garante que o status reflete a pendência
            newBocaValue = remaining;
        }

        // 1. Record the payment in order_payments (Log)
        const { error: paymentError } = await this.supabase.from('order_payments').insert({
            order_id: orderId,
            amount: amountPaid,
            payment_method: paymentMethod,
            received_by_user_id: user?.sub,
            receiver_name: user?.name || user?.email,
            type: 'payment',
            notes: `Recebimento parcial/total via ${paymentMethod}`
        });

        if (paymentError) throw new Error(`Erro ao gravar log de pagamento: ${paymentError.message}`);

        // 2. Record in Cash Flow
        try {
            await this.cashFlowService.createEntry({
                type: 'IN',
                category: 'venda',
                amount: amountPaid,
                description: `Recebimento Ref. Pedido #${orderId}`,
                order_id: orderId,
                user_id: user?.sub,
            });
        } catch (cfError) {
            console.error('⚠️ [CashFlow] Failed to record entry, but payment log was saved:', cfError.message);
        }

        // 3. Update Order
        const { error: updateError } = await this.supabase.from('orders').update({
            payment_status: newPaymentStatus,
            status: newOrderStatus,
            boca_value: newBocaValue,
            updated_at: new Date().toISOString()
        }).eq('id', orderId);

        if (updateError) throw new Error(`Erro ao atualizar pedido: ${updateError.message}`);

        return { message: 'Pagamento registrado com sucesso' };
    }

    /**
     * Gera o extrato financeiro completo do cliente (Conta Corrente)
     */
    async getCustomerStatement(customerId: number) {
        // 1. Fetch Orders (Debits)
        const { data: orders, error: ordersError } = await this.supabase
            .from('orders')
            .select('id, created_at, updated_at, total_amount, status, notes, boca_value')
            .eq('customer_id', customerId)
            // .neq('status', 'cancelled') // We include cancelled to show the full picture (Sale + Refund)
            .order('created_at', { ascending: true });

        if (ordersError) throw new Error(`Erro ao buscar pedidos: ${ordersError.message}`);

        // 2. Fetch Payments (Credits) linked to these orders
        // Note: For a "pure" account statement, we might want ALL payments from this customer,
        // but our current schema links payments to orders. So we fetch payments for the fetched orders.
        // A more advanced system would have a 'customer_ledger' table.
        // For now, aggregating payments from orders is sufficient.

        const orderIds = orders.map(o => o.id);
        let payments: any[] = [];

        if (orderIds.length > 0) {
            const { data: paymentsData, error: paymentsError } = await this.supabase
                .from('order_payments')
                .select('*')
                .in('order_id', orderIds)
                .order('created_at', { ascending: true });

            if (paymentsError) throw new Error(`Erro ao buscar pagamentos: ${paymentsError.message}`);
            payments = paymentsData;
        }

        // 3. Merge and Sort Transactions
        let transactions: any[] = [];

        // Add Orders (Debits)
        orders.forEach(order => {
            // Se o pedido foi cancelado, tratamos ele como entrada, mas também verificaremos se houve estorno no payments
            // Simplificação: Pedido = Débito (+). Pagamento = Crédito (-). Estorno = Crédito (-) ou Anulação de Débito?
            // Vamos seguir a lógica: Comprou = +Divida. Pagou = -Divida. Estornou (recebeu dinheiro de volta) = +Divida (anula o pagamento)?
            // NÃO. O "Cancelamento" em si anula a dívida do pedido.
            // Para simplificar o extrato visual, vamos mostrar apenas o que gera ou quita dívida.

            // Sale Transaction
            transactions.push({
                date: new Date(order.created_at),
                type: 'DEBIT', // Aumenta a dívida
                description: `Compra - Pedido #${order.id} (${order.status})`,
                amount: Number(order.total_amount),
                reference_id: order.id,
                meta: { notes: order.notes }
            });

            // If order is cancelled, we should credit it back to zero out the debt?
            // Yes, if I buy 100, I owe 100. If I cancel, I owe 0. So Cancel = Credit 100.
            if (order.status === 'cancelled') {
                // Find when it was updated/cancelled? using updated_at is a rough proxy
                transactions.push({
                    date: new Date(order.updated_at || order.created_at), // fallback
                    type: 'CREDIT', // Diminui a dívida (anula a compra)
                    description: `Cancelamento - Pedido #${order.id}`,
                    amount: Number(order.total_amount),
                    reference_id: order.id
                });
            }
        });

        // Add Payments (Credits)
        payments.forEach(payment => {
            if (payment.type === 'refund') {
                // Refund = Devolver dinheiro ao cliente. Aumenta a dívida?
                // Cenário: Compra 100 (Deve 100). Paga 100 (Deve 0). Cancela e recebe Estorno 100.
                // Cancelamento: -100 (Deve -100? Não, cancelamento anula a compra).
                // Se a compra foi anulada, o saldo deveria ser 0.
                // Compra (+100). Pagamento (-100). Cancelamento (-100). Reembolso (+100). Saldo Final = 0. Correto.
                // Refund = Dinheiro saindo da loja para o cliente. É um DÉBITO na conta do cliente (estamos dando dinheiro a ele).
                transactions.push({
                    date: new Date(payment.created_at),
                    type: 'DEBIT', // Aumenta a dívida (ou reduz o crédito que ele tinha)
                    description: `Estorno/Devolução - Ref. #${payment.order_id}`,
                    amount: Number(payment.amount),
                    reference_id: payment.order_id
                });
            } else {
                // Payment = Dinheiro entrando na loja. Abate a dívida.
                transactions.push({
                    date: new Date(payment.created_at),
                    type: 'CREDIT', // Diminui a dívida
                    description: `Pagamento (${payment.payment_method}) - Ref. #${payment.order_id}`,
                    amount: Number(payment.amount),
                    reference_id: payment.order_id
                });
            }
        });

        // Sort by Date
        transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Calculate Running Balance
        let runningBalance = 0;
        const result = transactions.map(t => {
            if (t.type === 'DEBIT') runningBalance += t.amount;
            else runningBalance -= t.amount;

            return {
                ...t,
                running_balance: runningBalance
            };
        });

        // Fetch Customer Info
        const { data: customer } = await this.supabase
            .from('customers')
            .select('id, name, phone, email')
            .eq('id', customerId)
            .single();

        return {
            customer,
            transactions: result,
            current_balance: runningBalance
        };
    }
}
