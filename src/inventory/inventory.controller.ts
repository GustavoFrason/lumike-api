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
import { StockEntryDto, StockExitDto } from './dto/stock-movement.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('products/:productId/entry')
  async addStock(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: StockEntryDto,
  ) {
    return this.inventoryService.addStock(productId, dto);
  }

  @Post('products/:productId/exit')
  async removeStock(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: StockExitDto,
  ) {
    return this.inventoryService.removeStock(productId, dto);
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
}

