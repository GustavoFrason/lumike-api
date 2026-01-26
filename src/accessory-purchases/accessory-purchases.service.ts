import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateAccessoryPurchaseDto } from './dto/create-accessory-purchase.dto';

@Injectable()
export class AccessoryPurchasesService {
    constructor(
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    ) { }

    async create(createDto: CreateAccessoryPurchaseDto) {
        const { data, error } = await this.supabase
            .from('accessory_purchases')
            .insert(createDto)
            .select()
            .single();

        if (error) {
            throw new Error(`Erro ao criar compra de acessório: ${error.message}`);
        }

        return data;
    }

    async findAll(page = 1, limit = 50, type?: string) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = this.supabase
            .from('accessory_purchases')
            .select('*', { count: 'exact' })
            .order('purchase_date', { ascending: false })
            .range(from, to);

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error, count } = await query;

        if (error) {
            throw new Error(`Erro ao listar compras de acessórios: ${error.message}`);
        }

        return {
            data: data || [],
            pagination: {
                page,
                limit,
                total: count || 0,
            },
        };
    }

    async remove(id: number) {
        const { error } = await this.supabase
            .from('accessory_purchases')
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(`Erro ao remover compra de acessório: ${error.message}`);
        }

        return { message: 'Item removido com sucesso' };
    }
}
