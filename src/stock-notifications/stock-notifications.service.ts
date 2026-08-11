import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto';

@Injectable()
export class StockNotificationsService {
  private readonly logger = new Logger(StockNotificationsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  async create(dto: CreateStockNotificationDto) {
    const { product_id, user_id, variant_id } = dto;
    let { email } = dto;

    // Se o usuário está logado, pegamos o e-mail dele do banco/auth se o placeholder foi enviado
    if (email === 'user-logged-in' && user_id) {
      const { data: userData } = await this.supabase
        .from('customers')
        .select('email')
        .eq('user_id', user_id)
        .maybeSingle();

      if (userData?.email) email = userData.email;
    }

    if (!email) {
      throw new BadRequestException(
        'E-mail é obrigatório para o alerta de estoque.',
      );
    }

    // Check if notification already exists
    const query = this.supabase
      .from('stock_notifications')
      .select('id')
      .eq('email', email)
      .eq('product_id', product_id)
      .eq('status', 'pending');

    if (variant_id) {
      query.eq('variant_id', variant_id);
    } else {
      query.is('variant_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      return {
        message: 'Você já possui um alerta pendente para este produto.',
      };
    }

    const { data, error } = await this.supabase
      .from('stock_notifications')
      .insert({
        user_id,
        email,
        product_id,
        variant_id,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(
        `Erro ao criar alerta de estoque: ${error.message}`,
      );
    }

    return data;
  }

  async getMyAlerts(userId: string | number) {
    const numericUserId = Number(userId);
    const { data, error } = await this.supabase
      .from('stock_notifications')
      .select(
        `
        *,
        product:product_id (
          id,
          name,
          slug,
          current_stock,
          price,
          preco_promocional,
          images:imagens_produto(url, ordem)
        )
      `,
      )
      .eq('user_id', numericUserId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        `Erro ao buscar alertas de estoque: ${error.message}`,
        error,
      );
      throw new BadRequestException(
        `Erro ao buscar seus alertas: ${error.message}`,
      );
    }

    return data.map((item) => ({
      ...item,
      product: {
        ...item.product,
        // Mantemos a estrutura compatível com ProductCard
      },
    }));
  }
}
