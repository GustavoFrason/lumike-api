/**
 * OrdersController
 * --------------------
 * Expõe endpoints REST para operações CRUD de pedidos/vendas.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetOrdersFilterDto } from './dto/get-orders-filter.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ALL_STAFF_ROLES, MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import type { AuthUser } from '../auth/types/auth-user.type';

/** Vendas (PDV): staff em geral cria/consulta. Cancelamento/edição de status: só admin/gestor. */
@Roles(...ALL_STAFF_ROLES)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.create(createOrderDto, user);
  }

  /** Revendedora (vendedor) só recebe as próprias vendas. */
  @Get()
  findAll(@Query() filters: GetOrdersFilterDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.findAll(filters, user);
  }

  /**
   * Totais por vendedora/loja e por estoque de origem no período. Precisa
   * vir antes de `:id`.
   */
  @Get('summary')
  summary(@Query() filters: GetOrdersFilterDto, @CurrentUser() user: AuthUser) {
    return this.ordersService.summary(filters, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.findOne(id, user);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.ordersService.updateStatus(id, status);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() details: { refundAmount: number; notes: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.cancelOrder(id, { ...details, user });
  }

  @Roles(...MANAGEMENT_ROLES)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.remove(id);
  }
}
