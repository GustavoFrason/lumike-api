import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { CashFlowService, CreateCashFlowDto } from './cash-flow.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import type { AuthUser } from '../auth/types/auth-user.type';

/** Fluxo de caixa: dado financeiro sensível, só admin/gestor. */
@Roles(...MANAGEMENT_ROLES)
@Controller('cash-flow')
export class CashFlowController {
  constructor(private readonly cashFlowService: CashFlowService) {}

  @Post()
  create(@Body() dto: CreateCashFlowDto, @CurrentUser() user?: AuthUser) {
    // Atribui o usuário logado se não enviado explicitamente.
    // Bug anterior: lia `req.user.userId`, campo que não existe no payload do JWT (é `sub`).
    if (!dto.user_id && user) {
      dto.user_id = user.sub;
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
  getStats(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.cashFlowService.getStats(days);
  }
}
