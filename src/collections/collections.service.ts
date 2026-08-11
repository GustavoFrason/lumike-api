/**
 * CollectionsService
 * --------------------
 * Responsável por operações CRUD de coleções no Supabase.
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Cria uma nova coleção
   */
  async create(createCollectionDto: CreateCollectionDto) {
    // Gera slug automaticamente se não fornecido
    const slug =
      createCollectionDto.slug || this.generateSlug(createCollectionDto.nome);

    const { data, error } = await this.supabase
      .from('colecoes')
      .insert({
        nome: createCollectionDto.nome,
        slug: slug,
        descricao: createCollectionDto.descricao,
        is_active:
          createCollectionDto.is_active !== undefined
            ? createCollectionDto.is_active
            : true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao criar coleção: ${error.message}`);
    }

    return data;
  }

  /**
   * Lista todas as coleções (com filtro opcional de ativas)
   */
  async findAll(isActive?: boolean) {
    let query = this.supabase
      .from('colecoes')
      .select('*')
      .order('nome', { ascending: true });

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Erro ao listar coleções: ${error.message}`);
    }

    return data;
  }

  /**
   * Busca uma coleção por ID
   */
  async findOne(id: string) {
    const { data, error } = await this.supabase
      .from('colecoes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Coleção com ID ${id} não encontrada`);
    }

    return data;
  }

  /**
   * Busca uma coleção por slug
   */
  async findBySlug(slug: string) {
    const { data, error } = await this.supabase
      .from('colecoes')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Coleção com slug "${slug}" não encontrada`);
    }

    return data;
  }

  /**
   * Atualiza uma coleção
   */
  async update(id: string, updateCollectionDto: UpdateCollectionDto) {
    // Verifica se a coleção existe
    await this.findOne(id);

    // Se o nome foi alterado e não há slug, gera um novo slug
    const updateData = { ...updateCollectionDto } as UpdateCollectionDto & {
      slug?: string;
    };
    if (updateCollectionDto.nome && !updateCollectionDto.slug) {
      updateData.slug = this.generateSlug(updateCollectionDto.nome);
    }

    const { data, error } = await this.supabase
      .from('colecoes')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar coleção: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove uma coleção (soft delete - marca como inativa)
   */
  async remove(id: string) {
    // Verifica se a coleção existe
    await this.findOne(id);

    const { data, error } = await this.supabase
      .from('colecoes')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao remover coleção: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove uma coleção permanentemente (hard delete)
   */
  async delete(id: string) {
    // Verifica se a coleção existe
    await this.findOne(id);

    const { error } = await this.supabase
      .from('colecoes')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Erro ao deletar coleção: ${error.message}`);
    }

    return { message: 'Coleção deletada permanentemente' };
  }

  /**
   * Gera slug a partir do nome
   */
  private generateSlug(nome: string): string {
    return nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]+/g, '-') // Substitui caracteres especiais por hífen
      .replace(/(^-|-$)/g, ''); // Remove hífens do início e fim
  }
}
