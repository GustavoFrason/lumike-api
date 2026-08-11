import { Module } from '@nestjs/common';
import { AccessoryPurchasesService } from './accessory-purchases.service';
import { AccessoryPurchasesController } from './accessory-purchases.controller';

@Module({
  controllers: [AccessoryPurchasesController],
  providers: [AccessoryPurchasesService],
  exports: [AccessoryPurchasesService], // Optional if used elsewhere
})
export class AccessoryPurchasesModule {}
