import { Module } from '@nestjs/common';
import { StockNotificationsService } from './stock-notifications.service';
import { StockNotificationsController } from './stock-notifications.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [StockNotificationsController],
  providers: [StockNotificationsService],
})
export class StockNotificationsModule {}
