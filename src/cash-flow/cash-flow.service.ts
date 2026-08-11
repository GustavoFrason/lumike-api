import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateCashFlowDto {
  @IsIn(['IN', 'OUT'])
  type: 'IN' | 'OUT';

  @IsIn(['venda', 'estorno', 'compra', 'ajuste', 'outros'])
  category: 'venda' | 'estorno' | 'compra' | 'ajuste' | 'outros';

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  order_id?: number;

  @IsOptional()
  @IsInt()
  user_id?: number;
}

@Injectable()
export class CashFlowService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  async createEntry(dto: CreateCashFlowDto) {
    const { error } = await this.supabase.from('cash_flow').insert({
      type: dto.type,
      category: dto.category,
      amount: dto.amount,
      description: dto.description,
      order_id: dto.order_id,
      user_id: dto.user_id,
    });

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao criar lançamento no fluxo de caixa: ${error.message}`,
      );
    }

    return { success: true };
  }

  async findAll(limit = 100) {
    const { data, error } = await this.supabase
      .from('cash_flow')
      .select(
        `
                *,
                users:user_id (name)
            `,
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar fluxo de caixa: ${error.message}`,
      );
    }

    return data || [];
  }

  /**
   * Busca o saldo atual.
   * A soma é feita no Postgres (view vw_cash_flow_balance — ver migration
   * 20260804_atomic_stock_and_orders.sql) em vez de trazer a tabela
   * `cash_flow` inteira para somar em JS, que não escala conforme o
   * histórico de lançamentos cresce.
   */
  async getBalance(): Promise<{ balance: number }> {
    const { data, error } = await this.supabase
      .from('vw_cash_flow_balance')
      .select('balance')
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar saldo do fluxo de caixa: ${error.message}`,
      );
    }

    return { balance: Number(data?.balance ?? 0) };
  }

  async getStats(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('cash_flow')
      .select('type, category, amount, created_at')
      .gte('created_at', startDate.toISOString());

    if (error)
      throw new InternalServerErrorException(
        `Erro ao buscar estatísticas: ${error.message}`,
      );

    // Aggregate by Category
    const categoryMap = new Map<string, { in: number; out: number }>();

    // Aggregate by Date
    const dateMap = new Map<string, { in: number; out: number }>();

    data?.forEach((item) => {
      const amount = Number(item.amount);
      // created_at é nullable no schema (tem DEFAULT mas não NOT NULL); na
      // prática o banco sempre preenche, mas o tipo obriga a lidar com null.
      const date = new Date(item.created_at ?? Date.now())
        .toISOString()
        .split('T')[0];
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
    const categoryStats = Array.from(categoryMap.entries()).map(
      ([name, val]) => ({
        name,
        value: val.out > 0 ? val.out : val.in, // Simplified for Pie Chart (mostly expenses breakdown focused, or revenue sources)
        type: val.out > 0 ? 'OUT' : 'IN',
      }),
    );

    // Fill gaps for last 30 days
    const dailyStats: { date: string; income: number; expense: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const stats = dateMap.get(dateStr) || { in: 0, out: 0 };

      dailyStats.push({
        date: new Date(d).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        }),
        income: stats.in,
        expense: stats.out,
      });
    }

    return { categoryStats, dailyStats };
  }
}
