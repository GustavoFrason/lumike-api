/**
 * CategoriesService
 * --------------------
 * Responsável por operações CRUD de categorias no Supabase.
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) { }

  /**
   * Cria uma nova categoria
   */
  async create(createCategoryDto: CreateCategoryDto) {
    // Gera slug automaticamente se não fornecido
    const slug = createCategoryDto.slug || this.generateSlug(createCategoryDto.name);

    const { data, error } = await this.supabase
      .from('categories')
      .insert({
        name: createCategoryDto.name,
        slug: slug,
        description: createCategoryDto.description,
        is_active: createCategoryDto.is_active !== undefined ? createCategoryDto.is_active : true,
        image_url: createCategoryDto.image_url,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao criar categoria: ${error.message}`);
    }

    return data;
  }

  /**
   * Lista todas as categorias (com filtro opcional de ativas)
   */
  async findAll(isActive?: boolean) {
    let query = this.supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Erro ao listar categorias: ${error.message}`);
    }

    return data;
  }

  /**
   * Busca uma categoria por ID
   */
  async findOne(id: number) {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Categoria com ID ${id} não encontrada`);
    }

    return data;
  }

  /**
   * Busca uma categoria por slug
   */
  async findBySlug(slug: string) {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Categoria com slug "${slug}" não encontrada`);
    }

    return data;
  }

  /**
   * Atualiza uma categoria
   */
  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    // Verifica se a categoria existe
    await this.findOne(id);

    // Se o nome foi alterado e não há slug, gera um novo slug
    const updateData = { ...updateCategoryDto } as UpdateCategoryDto & { slug?: string };
    if (updateCategoryDto.name && !updateCategoryDto.slug) {
      updateData.slug = this.generateSlug(updateCategoryDto.name);
    }

    const { data, error } = await this.supabase
      .from('categories')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar categoria: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove uma categoria (soft delete - marca como inativa)
   */
  async remove(id: number) {
    // Verifica se a categoria existe
    await this.findOne(id);

    const { data, error } = await this.supabase
      .from('categories')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao remover categoria: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove uma categoria permanentemente (hard delete)
   */
  async delete(id: number) {
    // Verifica se a categoria existe
    await this.findOne(id);

    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Erro ao deletar categoria: ${error.message}`);
    }

    return { message: 'Categoria deletada permanentemente' };
  }

  /**
   * Gera slug a partir do nome
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]+/g, '-') // Substitui caracteres especiais por hífen
      .replace(/(^-|-$)/g, ''); // Remove hífens do início e fim
  }
}

