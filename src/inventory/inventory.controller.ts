/**
 * InventoryController
 * --------------------
 * Expõe endpoints para gestão de estoque.
 */

import {
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  Body,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  StockAdjustmentDto,
  StockEntryDto,
  StockExitDto,
  StockTransferDto,
} from './dto/stock-movement.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { ALL_STAFF_ROLES, MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';

/** Leitura de estoque: staff em geral. Movimentações (entrada/saída/transferência): só admin/gestor. */
@Roles(...ALL_STAFF_ROLES)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Roles(...MANAGEMENT_ROLES)
  @Post('products/:productId/entry')
  async addStock(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: StockEntryDto,
    @Query('userId') userId?: string,
  ) {
    return this.inventoryService.addStock(
      productId,
      dto,
      userId ? Number(userId) : null,
    );
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post('products/:productId/transfer')
  async transferStock(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: StockTransferDto,
  ) {
    return this.inventoryService.transferStock(productId, dto);
  }

  /** Conferência física: compara contagem manual com o sistema e ajusta a diferença. */
  @Roles(...MANAGEMENT_ROLES)
  @Post('products/:productId/adjustment')
  async adjustFromCount(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: StockAdjustmentDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.inventoryService.adjustFromCount(
      productId,
      dto,
      user?.sub ?? null,
    );
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post('products/:productId/exit')
  async removeStock(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: StockExitDto,
    @Query('userId') userId?: string,
  ) {
    return this.inventoryService.removeStock(
      productId,
      dto,
      userId ? Number(userId) : null,
    );
  }

  @Get('products/:productId/history')
  async getHistory(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.inventoryService.getProductHistory(productId, limit);
  }

  @Get('products/:productId/stock')
  async getStock(@Param('productId', ParseIntPipe) productId: number) {
    return this.inventoryService.getProductStock(productId);
  }

  @Get('users/:userId')
  async getUserStock(@Param('userId', ParseIntPipe) userId: number) {
    return this.inventoryService.getUserStock(userId);
  }

  /** Tudo que está com cada revendedor(a), de uma vez — pra conferência periódica. */
  @Get('sellers')
  async getAllSellersStock() {
    return this.inventoryService.getAllSellersStock();
  }
}
