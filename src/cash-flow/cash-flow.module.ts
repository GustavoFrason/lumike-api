import { Module } from '@nestjs/common';
import { CashFlowService } from './cash-flow.service';
import { CashFlowController } from './cash-flow.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  providers: [CashFlowService],
  controllers: [CashFlowController],
  exports: [CashFlowService],
})
export class CashFlowModule {}
