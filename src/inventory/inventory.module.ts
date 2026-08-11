/**
 * InventoryModule
 * --------------------
 * Define o módulo de gestão de estoque da Lumike API.
 */

import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
