import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contact_name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /** CNPJ ou CPF, sem máscara ou com — a UI que decide a formatação. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  async create(dto: CreateSupplierDto) {
    const { data, error } = await this.supabase
      .from('suppliers')
      .insert(dto)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao criar fornecedor: ${error.message}`,
      );
    }

    return data;
  }

  async findAll(page = 1, limit = 50) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('suppliers')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(from, to);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar fornecedores: ${error.message}`,
      );
    }

    return {
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    };
  }

  async findOne(id: number) {
    const { data, error } = await this.supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Fornecedor #${id} não encontrado`);
    }

    return data;
  }

  async update(id: number, dto: Partial<CreateSupplierDto>) {
    const { data, error } = await this.supabase
      .from('suppliers')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao atualizar fornecedor: ${error.message}`,
      );
    }

    return data;
  }

  async remove(id: number) {
    const { error } = await this.supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao remover fornecedor: ${error.message}`,
      );
    }

    return { success: true };
  }

  /**
   * Calcula o ROI detalhado por fornecedor
   */
  async getROIAnalysis() {
    try {
      // 1. Fetch all suppliers
      const { data: suppliers, error: sError } = await this.supabase
        .from('suppliers')
        .select('id, name');

      if (sError) {
        this.logger.error(
          `[ROI] Erro ao buscar fornecedores: ${sError.message}`,
          sError,
        );
        throw sError;
      }

      // 2. Fetch costs from purchase_items
      const { data: costs, error: cError } = await this.supabase.from(
        'purchase_items',
      ).select(`
                    unit_cost,
                    quantity,
                    product_id,
                    purchases:purchase_id(supplier_id)
                `);

      if (cError) {
        this.logger.error(
          `[ROI] Erro ao buscar custos: ${cError.message}`,
          cError,
        );
        throw cError;
      }

      // 3. Fetch revenue from order_items
      // Fallback: Since products.supplier_id might be missing,
      // we attribute sales based on purchase history mapping.
      const { data: sales, error: saError } = await this.supabase.from(
        'order_items',
      ).select(`
                    product_id,
                    total_price
                `);

      if (saError) {
        this.logger.error(
          `[ROI] Erro ao buscar vendas: ${saError.message}`,
          saError,
        );
        throw saError;
      }

      // 4. Map products to their most recent supplier (for attribution)
      const productToSupplierMap = new Map<number, number>();
      // Sort costs by purchase identity (assuming higher ID means more recent)
      // In a better system, we'd use purchase.created_at
      if (costs) {
        costs.forEach((c) => {
          const supplierId = c.purchases?.supplier_id;
          if (supplierId) {
            productToSupplierMap.set(c.product_id, supplierId);
          }
        });
      }

      // 5. Aggregate
      this.logger.debug(
        `[ROI] ${suppliers?.length} fornecedores, ${costs?.length} custos, ${sales?.length} vendas`,
      );

      const analysis = (suppliers || []).map((s) => {
        // Costs are easy: linked directly via purchases
        const supplierCosts =
          (costs || [])
            .filter((c) => c.purchases?.supplier_id === s.id)
            .reduce(
              (sum, c) => sum + Number(c.unit_cost) * Number(c.quantity),
              0,
            ) || 0;

        // Revenue: attributed via the map
        const supplierRevenue =
          (sales || [])
            .filter((sa) => productToSupplierMap.get(sa.product_id) === s.id)
            .reduce((sum, sa) => sum + Number(sa.total_price), 0) || 0;

        const profit = supplierRevenue - supplierCosts;
        const roi = supplierCosts > 0 ? (profit / supplierCosts) * 100 : 0;

        return {
          supplier_id: s.id,
          supplier_name: s.name,
          total_invested: supplierCosts,
          total_revenue: supplierRevenue,
          gross_profit: profit,
          roi: Number(roi.toFixed(2)),
        };
      });

      return analysis;
    } catch (error) {
      this.logger.error(
        `[ROI] Falha crítica em getROIAnalysis: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
