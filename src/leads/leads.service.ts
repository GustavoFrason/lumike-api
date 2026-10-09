import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { CreateLeadDto } from './dto/create-lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  async create(data: CreateLeadDto) {
    // 1. Check if lead already exists (by Email or WhatsApp).
    // Duas consultas `.eq()` em vez de `.or()` interpolado: o whatsapp é
    // texto livre e, dentro de `.or()`, vírgula/parênteses viram filtros
    // extras (dava pra puxar o cupom de outra pessoa).
    const existingLead =
      (await this.findExistingLead('email', data.email)) ??
      (await this.findExistingLead('whatsapp', data.whatsapp));

    if (existingLead) {
      // Logic: Do not generate a new code. Return the existing one.
      // This prevents "duplicate discounts" while allowing the user to recover their code.
      return {
        success: true,
        coupon_code: existingLead.coupon_code,
        message: 'Você já possui um cadastro! Aqui está seu cupom novamente.',
        is_existing: true,
      };
    }

    // 2. Generate a simple coupon code
    // Format: FIRSTNAME + 10 (e.g., JOAO10) or Random
    const firstName = data.name
      .split(' ')[0]
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    const couponCode = `${firstName}${randomSuffix}`;

    // 3. Insert into DB
    const { error } = await this.supabase
      .from('leads')
      .insert({
        name: data.name,
        email: data.email,
        whatsapp: data.whatsapp,
        birthday: data.birthday,
        coupon_code: couponCode,
        is_used: false,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Erro ao criar lead: ${error.message}`, error);
      // Rota pública: detalhe do erro de banco fica só no log.
      throw new BadRequestException(
        'Não foi possível salvar seu cadastro. Tente novamente.',
      );
    }

    return {
      success: true,
      coupon_code: couponCode,
      message: 'Cupom gerado com sucesso! Utilize no WhatsApp.',
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

  private async findExistingLead(column: 'email' | 'whatsapp', value: string) {
    if (!value) return null;

    const { data } = await this.supabase
      .from('leads')
      .select('*')
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    return data;
  }
}
