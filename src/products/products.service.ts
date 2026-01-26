/**
 * ProductsService
 * --------------------
 * Responsável por operações CRUD de produtos no Supabase.
 */

import { Injectable, Inject, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) { }

  /**
   * Cria um novo produto
   */
  async create(createProductDto: CreateProductDto & { existingProductId?: number }) {
    const { existingProductId, ...productData } = createProductDto as any;

    // If existingProductId is provided, UPDATE instead of CREATE
    if (existingProductId) {
      // Get current stock to sum with new stock
      const { data: current } = await this.supabase
        .from('products')
        .select('current_stock')
        .eq('id', existingProductId)
        .single();

      const newTotalStock = (current?.current_stock || 0) + (productData.current_stock || 0);

      // Update existing product with new data and summed stock
      return this.update(existingProductId, {
        ...productData,
        current_stock: newTotalStock,
      });
    }

    // Normal creation flow - check if SKU already exists
    if (productData.sku) {
      const { data: existing } = await this.supabase
        .from('products')
        .select('id')
        .eq('sku', productData.sku)
        .maybeSingle();

      if (existing) {
        throw new BadRequestException(`Produto com SKU '${productData.sku}' já existe!`);
      }
    }

    const { data: productDataResult, error } = await this.supabase
      .from('products')
      .insert({
        sku: productData.sku,
        sku2: productData.sku2,
        name: productData.name,
        short_description: productData.short_description,
        description: productData.description,
        slug: productData.slug,
        price: productData.price,
        preco_promocional: productData.preco_promocional,
        cost_price: productData.cost_price || 0,
        purchase_date: productData.purchase_date,
        category_id: productData.category_id,
        colecao_id: productData.colecao_id,
        collection: productData.collection,
        current_stock: productData.current_stock || 0,
        min_stock: productData.min_stock || 0,
        is_active: productData.is_active !== undefined ? productData.is_active : true,
        is_featured: productData.is_featured !== undefined ? productData.is_featured : false,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Erro ao criar produto: ${error.message}`);
    }

    return productDataResult;
  }

  /**
   * Lista todos os produtos (com paginação opcional)
   */
  async findAll(page = 1, limit = 50, isActive?: boolean, search?: string, categoryId?: number, isFeatured?: boolean) {
    let query = this.supabase
      .from('products')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          slug
        ),
        images:imagens_produto (
          url,
          ordem
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,sku2.ilike.%${search}%`);
    }

    if (isFeatured !== undefined) {
      query = query.eq('is_featured', isFeatured);
    }

    // Paginação
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new InternalServerErrorException(`Erro ao listar produtos: ${error.message}`);
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count || data.length,
      },
    };
  }

  /**
   * Busca um produto por ID
   */
  async findOne(id: number) {
    const { data, error } = await this.supabase
      .from('products')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          slug
        ),
        images:imagens_produto (
          url,
          ordem
        )
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Produto com ID ${id} não encontrado`);
    }

    return data;
  }

  /**
   * Busca um produto por slug
   */
  async findBySlug(slug: string) {
    const { data, error } = await this.supabase
      .from('products')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          slug
        ),
        images:imagens_produto (
          url,
          ordem
        )
      `)
      .eq('slug', slug)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Produto com slug "${slug}" não encontrado`);
    }

    return data;
  }

  /**
   * Atualiza um produto
   */
  async update(id: number, updateProductDto: UpdateProductDto) {
    // Verifica se o produto existe
    await this.findOne(id);

    // 1. Atualizar Produto principal
    const { data, error } = await this.supabase
      .from('products')
      .update({
        sku: updateProductDto.sku,
        sku2: updateProductDto.sku2,
        name: updateProductDto.name,
        short_description: updateProductDto.short_description,
        description: updateProductDto.description,
        slug: updateProductDto.slug,
        price: updateProductDto.price,
        preco_promocional: updateProductDto.preco_promocional,
        cost_price: updateProductDto.cost_price,
        purchase_date: updateProductDto.purchase_date,
        current_stock: updateProductDto.current_stock,
        min_stock: updateProductDto.min_stock,
        category_id: updateProductDto.category_id,
        colecao_id: updateProductDto.colecao_id,
        collection: updateProductDto.collection,
        is_active: updateProductDto.is_active,
        is_featured: updateProductDto.is_featured,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Erro ao atualizar produto: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove um produto (soft delete - marca como inativo)
   */
  async remove(id: number) {
    // Verifica se o produto existe
    await this.findOne(id);

    const { data, error } = await this.supabase
      .from('products')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(`Erro ao remover produto: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove um produto permanentemente (hard delete)
   */
  async delete(id: number) {
    // Verifica se o produto existe
    await this.findOne(id);

    const { error } = await this.supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      throw new InternalServerErrorException(`Erro ao deletar produto: ${error.message}`);
    }

    return { message: 'Produto deletado permanentemente' };
  }

  /**
   * Ativa múltiplos produtos
   */
  async activateMany(ids: number[]) {
    const { data, error } = await this.supabase
      .from('products')
      .update({ is_active: true })
      .in('id', ids);

    if (error) {
      throw new InternalServerErrorException(`Erro ao ativar produtos em massa: ${error.message}`);
    }

    return data;
  }

  /**
   * Desativa múltiplos produtos
   */
  async deactivateMany(ids: number[]) {
    const { data, error } = await this.supabase
      .from('products')
      .update({ is_active: false })
      .in('id', ids);

    if (error) {
      throw new InternalServerErrorException(`Erro ao desativar produtos em massa: ${error.message}`);
    }

    return data;
  }
}

