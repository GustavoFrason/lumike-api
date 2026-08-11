import { Controller, Post, Get, Body } from '@nestjs/common';
import { StockNotificationsService } from './stock-notifications.service';
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';

@Controller('stock-notifications')
export class StockNotificationsController {
  constructor(private readonly service: StockNotificationsService) {}

  @Public() // Permite que visitantes (sem login) também peçam alerta por e-mail
  @Post()
  async create(@Body() dto: CreateStockNotificationDto) {
    return this.service.create(dto);
  }

  /** Escopo é sempre o próprio usuário — JwtAuthGuard global já exige autenticação. */
  @Get('my-alerts')
  async getMyAlerts(@CurrentUser() user: AuthUser) {
    return this.service.getMyAlerts(user.sub);
  }
}
