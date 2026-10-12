/**
 * ResellersController
 * --------------------
 * Acerto com revendedora: extrato, registro e histórico. Só a gestão.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ResellersService } from './resellers.service';
import { StatementQueryDto } from './dto/statement-query.dto';
import { CreateSettlementDto } from './dto/create-settlement.dto';

@Roles(...MANAGEMENT_ROLES)
@Controller('resellers')
export class ResellersController {
  constructor(private readonly resellersService: ResellersService) {}

  @Get()
  list() {
    return this.resellersService.list();
  }

  @Get(':id/statement')
  statement(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: StatementQueryDto,
  ) {
    return this.resellersService.getStatement(
      id,
      query.period_start,
      query.period_end,
    );
  }

  @Get(':id/settlements')
  settlements(@Param('id', ParseIntPipe) id: number) {
    return this.resellersService.listSettlements(id);
  }

  @Post(':id/settlements')
  createSettlement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSettlementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.resellersService.createSettlement(id, dto, user);
  }
}
