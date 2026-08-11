/**
 * ProductsImagesService
 * --------------------
 * Responsável por operações com imagens de produtos no Supabase Storage.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

@Injectable()
export class ProductsImagesService {
  private readonly BUCKET_NAME = 'produtos';
  private readonly logger = new Logger(ProductsImagesService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Faz upload de uma imagem para o Supabase Storage
   */
  async uploadImage(
    productId: number,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    ordem: number = 0,
  ) {
    const fileExt = fileName.split('.').pop();
    const storageFileName = `${productId}/${Date.now()}.${fileExt}`;

    // Upload para o Storage
    const { data: uploadData, error: uploadError } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .upload(storageFileName, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Erro ao fazer upload: ${uploadError.message}`);
    }

    // Obtém a URL pública da imagem
    const {
      data: { publicUrl },
    } = this.supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(storageFileName);

    // Registra a imagem na tabela imagens_produto
    const { data: imageData, error: dbError } = await this.supabase
      .from('imagens_produto')
      .insert({
        produto_id: productId,
        url: publicUrl,
        ordem: ordem,
      })
      .select()
      .single();

    if (dbError) {
      // Se falhar ao registrar no DB, tenta remover o arquivo do storage
      await this.supabase.storage
        .from(this.BUCKET_NAME)
        .remove([storageFileName]);
      throw new Error(`Erro ao registrar imagem: ${dbError.message}`);
    }

    return imageData;
  }

  /**
   * Lista todas as imagens de um produto
   */
  async getProductImages(productId: number) {
    const { data, error } = await this.supabase
      .from('imagens_produto')
      .select('*')
      .eq('produto_id', productId)
      .order('ordem', { ascending: true });

    if (error) {
      throw new Error(`Erro ao buscar imagens: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove uma imagem
   */
  async deleteImage(imageId: string) {
    // Busca a imagem para obter a URL
    const { data: image, error: fetchError } = await this.supabase
      .from('imagens_produto')
      .select('url')
      .eq('id', imageId)
      .single();

    if (fetchError || !image) {
      throw new Error('Imagem não encontrada');
    }

    // Extrai o nome do arquivo da URL
    const urlParts = image.url.split('/');
    const fileName =
      urlParts[urlParts.length - 2] + '/' + urlParts[urlParts.length - 1];

    // Remove do Storage
    const { error: storageError } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .remove([fileName]);

    if (storageError) {
      this.logger.warn(
        `Erro ao remover arquivo do storage: ${storageError.message}`,
      );
    }

    // Remove do banco de dados
    const { error: dbError } = await this.supabase
      .from('imagens_produto')
      .delete()
      .eq('id', imageId);

    if (dbError) {
      throw new Error(`Erro ao remover imagem: ${dbError.message}`);
    }

    return { message: 'Imagem removida com sucesso' };
  }

  /**
   * Registra uma imagem já hospedada (URL fornecida)
   * O upload deve ser feito no frontend via Supabase Storage
   */
  async registerImage(productId: number, url: string, ordem: number = 0) {
    const { data, error } = await this.supabase
      .from('imagens_produto')
      .insert({
        produto_id: productId,
        url: url,
        ordem: ordem,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao registrar imagem: ${error.message}`);
    }

    return data;
  }

  /**
   * Atualiza a ordem das imagens
   */
  async updateImageOrder(imageId: string, ordem: number) {
    const { data, error } = await this.supabase
      .from('imagens_produto')
      .update({ ordem })
      .eq('id', imageId)
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar ordem: ${error.message}`);
    }

    return data;
  }
}
