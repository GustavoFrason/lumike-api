import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Adiciona ou remove um produto dos favoritos.
   * Retorna { isFavorite: boolean }
   */
  async toggle(userId: number, productId: number) {
    // Verifica se já existe
    const { data: existing } = await this.supabase
      .from('product_favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();

    if (existing) {
      // Remove
      await this.supabase
        .from('product_favorites')
        .delete()
        .eq('id', existing.id);
      return { isFavorite: false };
    } else {
      // Adiciona
      const { error } = await this.supabase
        .from('product_favorites')
        .insert({ user_id: userId, product_id: productId });

      if (error) {
        throw new BadRequestException(`Erro ao favoritar: ${error.message}`);
      }
      return { isFavorite: true };
    }
  }

  /**
   * Retorna os IDs dos produtos favoritos do usuário (para marcar os corações na home)
   */
  async getFavoriteIds(userId: number): Promise<number[]> {
    const { data, error } = await this.supabase
      .from('product_favorites')
      .select('product_id')
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`Erro ao buscar favoritos: ${error.message}`, error);
      return [];
    }

    return data.map((item) => item.product_id);
  }

  /**
   * Retorna a lista completa de produtos favoritos (para a área do cliente)
   */
  async getFavorites(userId: number) {
    // Faz join com products buscando todos os campos necessários para o ProductCard
    const { data, error } = await this.supabase
      .from('product_favorites')
      .select(
        `
        id,
        created_at,
        products:product_id (
            *,
            images:imagens_produto(url, ordem),
            categories:category_id(id, name, slug)
        )
      `,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(
        `Erro ao listar favoritos: ${error.message}`,
      );
    }

    // Remapeia para facilitar o frontend, tratando o objeto retornado pelo join
    return data.map((item) => {
      const product = item.products;
      return {
        favorite_id: item.id,
        favorited_at: item.created_at,
        ...product,
        // Normalizar preços se necessário, mas vindo do banco já devem estar corretos
      };
    });
  }
}
