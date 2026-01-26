import { Controller, Get, Post, Body, Query, ParseIntPipe, DefaultValuePipe, UseGuards, Request } from '@nestjs/common';
import { CashFlowService, CreateCashFlowDto } from './cash-flow.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('cash-flow')
@UseGuards(JwtAuthGuard)
export class CashFlowController {
    constructor(private readonly cashFlowService: CashFlowService) { }

    @Post()
    create(@Body() dto: CreateCashFlowDto, @Request() req) {
        // Atribui o usuário logado se não enviado
        if (!dto.user_id && req.user) {
            dto.user_id = req.user.userId;
        }
        return this.cashFlowService.createEntry(dto);
    }

    @Get()
    findAll(
        @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    ) {
        return this.cashFlowService.findAll(limit);
    }

    @Get('balance')
    getBalance() {
        return this.cashFlowService.getBalance();
    }

    @Get('stats')
    getStats(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
        return this.cashFlowService.getStats(days);
    }
}
