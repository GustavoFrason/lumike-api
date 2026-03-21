import { Injectable, Inject, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export class CreatePurchaseDto {
    supplier_id: number;
    notes?: string;
    items: {
        product_id: number;
        quantity: number;
        unit_cost: number;
    }[];
}

@Injectable()
export class PurchasesService {
    constructor(
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    ) { }

    async create(dto: CreatePurchaseDto) {
        // Calculate total amount
        const totalAmount = dto.items.reduce((sum, item) => sum + (item.unit_cost * item.quantity), 0);

        // 1. Create Purchase record
        const { data: purchase, error: pError } = await this.supabase
            .from('purchases')
            .insert({
                supplier_id: dto.supplier_id,
                total_amount: totalAmount,
                notes: dto.notes,
            })
            .select()
            .single();

        if (pError) throw new InternalServerErrorException(`Erro ao criar compra: ${pError.message}`);

        // 2. Create Purchase Items
        const purchaseItems = dto.items.map(item => ({
            purchase_id: purchase.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
        }));

        const { error: piError } = await this.supabase
            .from('purchase_items')
            .insert(purchaseItems);

        if (piError) throw new InternalServerErrorException(`Erro ao criar itens da compra: ${piError.message}`);

        // 3. Update Product Stock and Cost Price
        for (const item of dto.items) {
            // Update cost_price (we could use average cost, but for now we update to latest)
            await this.supabase
                .from('products')
                .update({ 
                    cost_price: item.unit_cost,
                    supplier_id: dto.supplier_id // Also auto-link supplier if not set
                })
                .eq('id', item.product_id);
            
            // Stock is updated via TRIGGER `tg_purchase_items_ai` in COMPLETE_SCHEMA.sql
            // So we don't need to manually update product stock here.
        }

        return purchase;
    }

    async findAll(page = 1, limit = 50) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, error, count } = await this.supabase
            .from('purchases')
            .select(`
                *,
                suppliers:supplier_id (name)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw new InternalServerErrorException(`Erro ao listar compras: ${error.message}`);

        return {
            data: data || [],
            pagination: { page, limit, total: count || 0 },
        };
    }

    async findOne(id: number) {
        const { data: purchase, error } = await this.supabase
            .from('purchases')
            .select(`
                *,
                suppliers:supplier_id (name),
                items:purchase_items (
                    *,
                    products:product_id (name, sku)
                )
            `)
            .eq('id', id)
            .single();

        if (error || !purchase) throw new NotFoundException(`Compra #${id} não encontrada`);

        return purchase;
    }
}
