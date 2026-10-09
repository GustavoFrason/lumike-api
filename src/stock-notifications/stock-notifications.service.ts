import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { isEmail } from 'class-validator';
import type { Database } from '../types/supabase';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto';

@Injectable()
export class StockNotificationsService {
  private readonly logger = new Logger(StockNotificationsService.name);

  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Cria um alerta "avise-me".
   *
   * Identidade vem SEMPRE do JWT (`user`), nunca de `dto.user_id`: antes,
   * mandar `{ email: 'user-logged-in', user_id: N }` sem login devolvia o
   * e-mail do cliente N. Visitante anônimo precisa informar um e-mail
   * válido. A resposta nunca inclui o e-mail.
   */
  async create(dto: CreateStockNotificationDto, user?: AuthUser) {
    const { product_id, variant_id } = dto;
    const userId = user?.sub ?? null;
    const email = user?.email ?? dto.email;

    if (!email || !isEmail(email)) {
      throw new BadRequestException(
        'Informe um e-mail válido para o alerta de estoque.',
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
        user_id: userId,
        email,
        product_id,
        variant_id,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      this.logger.error(`Erro ao criar alerta de estoque: ${error.message}`);
      throw new BadRequestException(
        'Não foi possível criar o alerta de estoque.',
      );
    }

    return {
      id: data.id,
      message: 'Pronto! Avisaremos quando o produto voltar ao estoque.',
    };
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
