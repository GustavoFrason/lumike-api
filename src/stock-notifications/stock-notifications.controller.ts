import { Controller, Post, Get, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StockNotificationsService } from './stock-notifications.service';
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';

@Controller('stock-notifications')
export class StockNotificationsController {
  constructor(private readonly service: StockNotificationsService) {}

  /**
   * Público (visitante pede alerta informando o e-mail), com autenticação
   * opcional: se vier token válido, o alerta é do usuário do JWT — nunca de
   * um `user_id` enviado no body.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(
    @Body() dto: CreateStockNotificationDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.create(dto, user);
  }

  /** Escopo é sempre o próprio usuário — JwtAuthGuard global já exige autenticação. */
  @Get('my-alerts')
  async getMyAlerts(@CurrentUser() user: AuthUser) {
    return this.service.getMyAlerts(user.sub);
  }
}
