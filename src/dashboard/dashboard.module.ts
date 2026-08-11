/**
 * DashboardModule
 * --------------------
 * Define o módulo de dashboard da Lumike API.
 */

import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { CashFlowModule } from '../cash-flow/cash-flow.module';

@Module({
  imports: [CashFlowModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
