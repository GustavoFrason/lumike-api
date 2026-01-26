import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { CashFlowModule } from '../cash-flow/cash-flow.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [InventoryModule, CashFlowModule, SupabaseModule, SettingsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule { }
