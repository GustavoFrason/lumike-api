/**
 * InventoryService
 * --------------------
 * Responsável por operações de gestão de estoque.
 */

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { StockEntryDto, StockExitDto } from './dto/stock-movement.dto';

@Injectable()
export class InventoryService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Registra entrada de estoque
   */
  async addStock(productId: number, dto: StockEntryDto) {
    // Verifica se o produto existe
    const { data: product, error: productError } = await this.supabase
      .from('products')
      .select('id, current_stock')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      throw new NotFoundException(`Produto com ID ${productId} não encontrado`);
    }

    const newStock = product.current_stock + dto.quantity;

    // Atualiza o estoque do produto
    const { data: updatedProduct, error: updateError } = await this.supabase
      .from('products')
      .update({ current_stock: newStock })
      .eq('id', productId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Erro ao atualizar estoque: ${updateError.message}`);
    }

    // Registra o movimento no histórico
    const { error: movementError } = await this.supabase
      .from('inventory_movements')
      .insert({
        product_id: productId,
        movement: 'IN',
        quantity: dto.quantity,
        reference: dto.reference || `manual:${Date.now()}`,
      });

    if (movementError) {
      console.warn(`Erro ao registrar movimento: ${movementError.message}`);
    }

    // Atualiza a tabela estoque separada
    const { error: stockError } = await this.supabase
      .from('estoque')
      .upsert(
        {
          produto_id: productId,
          quantidade: newStock,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'produto_id',
        },
      );

    if (stockError) {
      console.warn(`Erro ao atualizar tabela estoque: ${stockError.message}`);
    }

    return {
      product: updatedProduct,
      movement: {
        type: 'IN',
        quantity: dto.quantity,
        newStock,
      },
    };
  }

  /**
   * Registra saída de estoque
   */
  async removeStock(productId: number, dto: StockExitDto) {
    // Verifica se o produto existe
    const { data: product, error: productError } = await this.supabase
      .from('products')
      .select('id, current_stock')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      throw new NotFoundException(`Produto com ID ${productId} não encontrado`);
    }

    if (product.current_stock < dto.quantity) {
      throw new BadRequestException(
        `Estoque insuficiente. Disponível: ${product.current_stock}, Solicitado: ${dto.quantity}`,
      );
    }

    const newStock = product.current_stock - dto.quantity;

    // Atualiza o estoque do produto
    const { data: updatedProduct, error: updateError } = await this.supabase
      .from('products')
      .update({ current_stock: newStock })
      .eq('id', productId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Erro ao atualizar estoque: ${updateError.message}`);
    }

    // Registra o movimento no histórico
    const { error: movementError } = await this.supabase
      .from('inventory_movements')
      .insert({
        product_id: productId,
        movement: 'OUT',
        quantity: -dto.quantity,
        reference: dto.reference || `manual:${Date.now()}`,
      });

    if (movementError) {
      console.warn(`Erro ao registrar movimento: ${movementError.message}`);
    }

    // Atualiza a tabela estoque separada
    const { error: stockError } = await this.supabase
      .from('estoque')
      .upsert(
        {
          produto_id: productId,
          quantidade: newStock,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'produto_id',
        },
      );

    if (stockError) {
      console.warn(`Erro ao atualizar tabela estoque: ${stockError.message}`);
    }

    return {
      product: updatedProduct,
      movement: {
        type: 'OUT',
        quantity: dto.quantity,
        newStock,
      },
    };
  }

  /**
   * Obtém o histórico de movimentações de um produto
   */
  async getProductHistory(productId: number, limit: number = 50) {
    const { data, error } = await this.supabase
      .from('inventory_movements')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Erro ao buscar histórico: ${error.message}`);
    }

    return data;
  }

  /**
   * Obtém o estoque atual de um produto
   */
  async getProductStock(productId: number) {
    const { data, error } = await this.supabase
      .from('estoque')
      .select('*')
      .eq('produto_id', productId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = não encontrado, que é ok
      throw new Error(`Erro ao buscar estoque: ${error.message}`);
    }

    return data || { produto_id: productId, quantidade: 0 };
  }
}

