/**
 * CustomersService
 * --------------------
 * Responsável por operações CRUD de clientes no Supabase.
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Cria um novo cliente
   */
  async create(createCustomerDto: CreateCustomerDto) {
    const { data, error } = await this.supabase
      .from('customers')
      .insert(createCustomerDto)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao criar cliente: ${error.message}`);
    }

    return data;
  }

  /**
   * Lista todos os clientes (com paginação opcional)
   */
  async findAll(page = 1, limit = 50) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Erro ao listar clientes: ${error.message}`);
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

  /**
   * Busca um cliente por ID
   */
  async findOne(id: number) {
    const { data, error } = await this.supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Cliente com ID ${id} não encontrado`);
    }

    return data;
  }

  /**
   * Atualiza um cliente
   */
  async update(id: number, updateCustomerDto: UpdateCustomerDto) {
    await this.findOne(id);

    const { data, error } = await this.supabase
      .from('customers')
      .update({
        ...updateCustomerDto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar cliente: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove um cliente
   */
  async remove(id: number) {
    await this.findOne(id);

    const { error } = await this.supabase.from('customers').delete().eq('id', id);

    if (error) {
      throw new Error(`Erro ao remover cliente: ${error.message}`);
    }

    return { message: 'Cliente removido com sucesso' };
  }
}

