import { Injectable, Inject, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export class CreateSupplierDto {
    name: string;
    cnpj?: string;
    email?: string;
    phone?: string;
    notes?: string;
}

@Injectable()
export class SuppliersService {
    constructor(
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    ) { }

    async create(dto: CreateSupplierDto) {
        const { data, error } = await this.supabase
            .from('suppliers')
            .insert(dto)
            .select()
            .single();

        if (error) {
            throw new InternalServerErrorException(`Erro ao criar fornecedor: ${error.message}`);
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
            throw new InternalServerErrorException(`Erro ao listar fornecedores: ${error.message}`);
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
            throw new InternalServerErrorException(`Erro ao atualizar fornecedor: ${error.message}`);
        }

        return data;
    }

    async remove(id: number) {
        const { error } = await this.supabase
            .from('suppliers')
            .delete()
            .eq('id', id);

        if (error) {
            throw new InternalServerErrorException(`Erro ao remover fornecedor: ${error.message}`);
        }

        return { success: true };
    }

    /**
     * Calcula o ROI detalhado por fornecedor
     */
    async getROIAnalysis() {
        // 1. Fetch all suppliers
        const { data: suppliers, error: sError } = await this.supabase
            .from('suppliers')
            .select('id, name');

        if (sError) throw sError;

        // 2. Fetch costs from purchase_items
        const { data: costs, error: cError } = await this.supabase
            .from('purchase_items')
            .select(`
                unit_cost,
                quantity,
                purchases!inner(supplier_id)
            `);

        if (cError) throw cError;

        // 3. Fetch revenue from order_items
        // This is tricky because order_items links to products, and products link back to suppliers.
        // We'll use the products.supplier_id to attribute revenue.
        const { data: sales, error: saError } = await this.supabase
            .from('order_items')
            .select(`
                total_price,
                products!inner(supplier_id)
            `);

        if (saError) throw saError;

        // 4. Aggregate
        const analysis = suppliers.map(s => {
            const supplierCosts = costs
                ?.filter(c => (c.purchases as any).supplier_id === s.id)
                .reduce((sum, c) => sum + (Number(c.unit_cost) * Number(c.quantity)), 0) || 0;

            const supplierRevenue = sales
                ?.filter(sa => (sa.products as any).supplier_id === s.id)
                .reduce((sum, sa) => sum + Number(sa.total_price), 0) || 0;

            const profit = supplierRevenue - supplierCosts;
            const roi = supplierCosts > 0 ? (profit / supplierCosts) * 100 : 0;

            return {
                supplier_id: s.id,
                supplier_name: s.name,
                total_invested: supplierCosts,
                total_revenue: supplierRevenue,
                gross_profit: profit,
                roi: Number(roi.toFixed(2))
            };
        });

        return analysis;
    }
}
