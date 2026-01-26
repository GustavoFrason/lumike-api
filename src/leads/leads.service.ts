import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateLeadDto } from './leads.controller';

@Injectable()
export class LeadsService {
    constructor(
        @Inject('SUPABASE_CLIENT')
        private readonly supabase: SupabaseClient,
    ) { }

    async create(data: CreateLeadDto) {
        // 1. Check if lead already exists (by Email or WhatsApp)
        const { data: existingLead } = await this.supabase
            .from('leads')
            .select('*')
            .or(`email.eq.${data.email},whatsapp.eq.${data.whatsapp}`)
            .single();

        if (existingLead) {
            // Logic: Do not generate a new code. Return the existing one.
            // This prevents "duplicate discounts" while allowing the user to recover their code.
            return {
                success: true,
                coupon_code: existingLead.coupon_code,
                message: 'Você já possui um cadastro! Aqui está seu cupom novamente.',
                is_existing: true
            };
        }

        // 2. Generate a simple coupon code
        // Format: FIRSTNAME + 10 (e.g., JOAO10) or Random
        const firstName = data.name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
        const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const couponCode = `${firstName}${randomSuffix}`;

        // 3. Insert into DB
        const { data: lead, error } = await this.supabase
            .from('leads')
            .insert({
                name: data.name,
                email: data.email,
                whatsapp: data.whatsapp,
                birthday: data.birthday,
                coupon_code: couponCode,
                is_used: false
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating lead:', error);
            throw new BadRequestException(`Erro ao salvar cadastro: ${error.message} (${error.details || ''})`);
        }

        return {
            success: true,
            coupon_code: couponCode,
            message: 'Cupom gerado com sucesso! Utilize no WhatsApp.'
        };
    }

    async findAll() {
        const { data, error } = await this.supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            throw new BadRequestException(error.message);
        }
        return data;
    }
}
