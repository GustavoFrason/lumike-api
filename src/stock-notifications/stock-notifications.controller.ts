import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { StockNotificationsService } from './stock-notifications.service';
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('stock-notifications')
export class StockNotificationsController {
    constructor(private readonly service: StockNotificationsService) { }

    @Public() // Permite que visitantes (sem login) também peçam alerta por e-mail
    @Post()
    async create(@Body() dto: CreateStockNotificationDto) {
        return this.service.create(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('my-alerts')
    async getMyAlerts(@Req() req) {
        const userId = req.user.sub;
        return this.service.getMyAlerts(userId);
    }
}
