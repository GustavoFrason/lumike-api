/**
 * ProductsImagesService
 * --------------------
 * Responsável por operações com imagens de produtos no Supabase Storage.
 */

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { detectImageMime } from '../common/utils/image-signature.util';

@Injectable()
export class ProductsImagesService {
  private readonly BUCKET_NAME = 'produtos';
  private readonly logger = new Logger(ProductsImagesService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Sobe uma imagem para o bucket `produtos` em `<folder>/<arquivo>` e
   * devolve a URL pública. Único caminho de escrita no Storage: o front
   * não sobe mais direto com a anon key (ver migration
   * 20261009000002_storage_produtos_revoke_anon_write).
   *
   * Tipo e extensão vêm dos magic bytes do arquivo — nunca do nome ou do
   * Content-Type enviados pelo cliente.
   */
  async uploadToStorage(
    folder: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; path: string }> {
    const detected = detectImageMime(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'Arquivo não é uma imagem válida (aceitos: JPG, PNG, WEBP, AVIF, GIF).',
      );
    }

    const uniqueSuffix = randomBytes(4).toString('hex');
    const path = `${folder}/${Date.now()}-${uniqueSuffix}.${detected.ext}`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .upload(path, file.buffer, {
        contentType: detected.mime,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      this.logger.error(`Erro ao subir imagem: ${uploadError.message}`);
      throw new InternalServerErrorException('Erro ao fazer upload da imagem.');
    }

    const {
      data: { publicUrl },
    } = this.supabase.storage.from(this.BUCKET_NAME).getPublicUrl(path);

    return { url: publicUrl, path };
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
