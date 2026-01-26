import { Injectable, Inject, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export interface Setting {
    key: string;
    value: string;
    description: string;
    updated_at?: string;
}

@Injectable()
export class SettingsService {
    constructor(
        @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    ) { }

    /**
     * Lista todas as configurações
     */
    async findAll() {
        const { data, error } = await this.supabase
            .from('site_settings')
            .select('*')
            .order('key');

        if (error) {
            throw new InternalServerErrorException(`Erro ao listar configurações: ${error.message}`);
        }

        return data;
    }

    /**
     * Busca uma configuração por chave
     */
    async findOne(key: string) {
        const { data, error } = await this.supabase
            .from('site_settings')
            .select('*')
            .eq('key', key)
            .maybeSingle();

        if (error) {
            throw new InternalServerErrorException(`Erro ao buscar configuração '${key}': ${error.message}`);
        }

        if (!data) {
            throw new NotFoundException(`Configuração '${key}' não encontrada`);
        }

        return data;
    }

    /**
     * Busca um valor numérico por chave, retornando um default se não encontrar ou erro
     */
    async getNumber(key: string, defaultValue: number): Promise<number> {
        try {
            const setting = await this.findOne(key);
            const val = parseFloat(setting.value);
            return isNaN(val) ? defaultValue : val;
        } catch (error) {
            return defaultValue;
        }
    }

    /**
     * Atualiza uma configuração
     */
    async update(key: string, value: string) {
        // Check if exists
        await this.findOne(key);

        const { data, error } = await this.supabase
            .from('site_settings')
            .update({
                value,
                updated_at: new Date().toISOString()
            })
            .eq('key', key)
            .select()
            .single();

        if (error) {
            throw new InternalServerErrorException(`Erro ao atualizar configuração: ${error.message}`);
        }

        return data;
    }
}
