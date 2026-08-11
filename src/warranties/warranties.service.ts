import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, TablesUpdate } from '../types/supabase';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { UpdateWarrantyDto } from './dto/update-warranty.dto';

interface WarrantyFilters {
  status?: string;
  customer_id?: string;
  origin?: string;
}

@Injectable()
export class WarrantiesService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  async create(dto: CreateWarrantyDto) {
    const { data, error } = await this.supabase
      .from('warranties')
      .insert({
        ...dto,
        status: 'pending',
      })
      .select()
      .single();

    if (error)
      throw new InternalServerErrorException(
        `Erro ao criar garantia: ${error.message}`,
      );
    return data;
  }

  async findAll(page = 1, limit = 50, filters: WarrantyFilters = {}) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase.from('warranties').select(
      `
        *,
        customers:customer_id (name, email),
        products:product_id (name, sku)
      `,
      { count: 'exact' },
    );

    // Os filtros chegam como querystring (sempre string) — os `as` abaixo
    // refletem os enums reais da coluna; um valor fora do enum simplesmente
    // faz o Postgres retornar erro (comportamento já existente antes desta
    // tipagem, não é validado aqui).
    if (filters.status)
      query = query.eq(
        'status',
        filters.status as Database['public']['Enums']['warranty_status'],
      );
    if (filters.customer_id)
      query = query.eq('customer_id', Number(filters.customer_id));
    if (filters.origin)
      query = query.eq(
        'origin',
        filters.origin as Database['public']['Enums']['warranty_origin'],
      );

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error)
      throw new InternalServerErrorException(
        `Erro ao buscar garantias: ${error.message}`,
      );

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
      },
    };
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase
      .from('warranties')
      .select(
        `
        *,
        customers:customer_id (name, email, whatsapp),
        products:product_id (name, sku, images),
        orders:order_id (created_at, total_amount)
      `,
      )
      .eq('id', id)
      .single();

    if (error || !data)
      throw new NotFoundException(`Garantia com ID ${id} não encontrada`);
    return data;
  }

  async update(id: string, dto: UpdateWarrantyDto) {
    // updated_at/finished_at são `string | null` no schema (timestamptz);
    // antes gravava `Date` diretamente, que só funcionava por serialização
    // implícita do JSON.stringify — .toISOString() deixa isso explícito.
    const updateData: TablesUpdate<'warranties'> = {
      ...dto,
      updated_at: new Date().toISOString(),
    };

    if (dto.status === 'finished' || dto.status === 'rejected') {
      updateData.finished_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('warranties')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error)
      throw new InternalServerErrorException(
        `Erro ao atualizar garantia: ${error.message}`,
      );
    return data;
  }

  async remove(id: string) {
    const { error } = await this.supabase
      .from('warranties')
      .delete()
      .eq('id', id);

    if (error)
      throw new InternalServerErrorException(
        `Erro ao remover garantia: ${error.message}`,
      );
    return { success: true };
  }

  async getStats() {
    const { data, error } = await this.supabase
      .from('warranties')
      .select('status');

    if (error)
      throw new InternalServerErrorException(
        `Erro ao buscar estatísticas: ${error.message}`,
      );

    const stats = {
      total: data.length,
      pending: data.filter((w) => w.status === 'pending').length,
      analyzing: data.filter((w) => w.status === 'analyzing').length,
      factory: data.filter((w) => w.status === 'factory').length,
      ready: data.filter((w) => w.status === 'ready').length,
    };

    return stats;
  }
}
