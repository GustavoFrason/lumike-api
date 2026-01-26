import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export class CreateCashFlowDto {
    type: 'IN' | 'OUT';
    category: 'venda' | 'estorno' | 'compra' | 'ajuste' | 'outros';
    amount: number;
    description?: string;
    order_id?: number;
    user_id?: number;
}

@Injectable()
export class CashFlowService {
    constructor(
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    ) { }

    async createEntry(dto: CreateCashFlowDto) {
        const { error } = await this.supabase
            .from('cash_flow')
            .insert({
                type: dto.type,
                category: dto.category,
                amount: dto.amount,
                description: dto.description,
                order_id: dto.order_id,
                user_id: dto.user_id,
            });

        if (error) {
            throw new InternalServerErrorException(`Erro ao criar lançamento no fluxo de caixa: ${error.message}`);
        }

        return { success: true };
    }

    async findAll(limit = 100) {
        const { data, error } = await this.supabase
            .from('cash_flow')
            .select(`
                *,
                users:user_id (name)
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw new InternalServerErrorException(`Erro ao buscar fluxo de caixa: ${error.message}`);
        }

        return data || [];
    }

    /**
     * Busca o saldo atual (simplificado)
     */
    async getBalance() {
        const { data, error } = await this.supabase
            .from('cash_flow')
            .select('type, amount');

        if (error) throw error;

        const balance = data.reduce((acc, curr) => {
            return curr.type === 'IN' ? acc + Number(curr.amount) : acc - Number(curr.amount);
        }, 0);

        return { balance };
    }

    async getStats(days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data, error } = await this.supabase
            .from('cash_flow')
            .select('type, category, amount, created_at')
            .gte('created_at', startDate.toISOString());

        if (error) throw new InternalServerErrorException(`Erro ao buscar estatísticas: ${error.message}`);

        // Aggregate by Category
        const categoryMap = new Map<string, { in: number, out: number }>();

        // Aggregate by Date
        const dateMap = new Map<string, { in: number, out: number }>();

        data?.forEach(item => {
            const amount = Number(item.amount);
            const date = new Date(item.created_at).toISOString().split('T')[0];
            const cat = item.category;

            // Category Stats
            if (!categoryMap.has(cat)) categoryMap.set(cat, { in: 0, out: 0 });
            const catStats = categoryMap.get(cat)!;
            if (item.type === 'IN') catStats.in += amount;
            else catStats.out += amount;

            // Date Stats
            if (!dateMap.has(date)) dateMap.set(date, { in: 0, out: 0 });
            const dStats = dateMap.get(date)!;
            if (item.type === 'IN') dStats.in += amount;
            else dStats.out += amount;
        });

        // Format for Charts
        const categoryStats = Array.from(categoryMap.entries()).map(([name, val]) => ({
            name,
            value: val.out > 0 ? val.out : val.in, // Simplified for Pie Chart (mostly expenses breakdown focused, or revenue sources)
            type: val.out > 0 ? 'OUT' : 'IN'
        }));

        // Fill gaps for last 30 days
        const dailyStats: { date: string; income: number; expense: number }[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const stats = dateMap.get(dateStr) || { in: 0, out: 0 };

            dailyStats.push({
                date: new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                income: stats.in,
                expense: stats.out
            });
        }

        return { categoryStats, dailyStats };
    }
}
