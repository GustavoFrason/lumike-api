/**
 * DashboardController
 * --------------------
 * Expõe endpoints para dados do dashboard.
 */

import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  @Get('kpis')
  async getKPIs() {
    return this.dashboardService.getKPIs();
  }

  @Get('top-sellers')
  async getTopSellers(
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    return this.dashboardService.getTopSellers(limit);
  }

  @Get('low-stock')
  async getLowStock(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.dashboardService.getLowStockAlerts(limit);
  }

  @Get('revenue-history')
  async getRevenueHistory() {
    return this.dashboardService.getRevenueHistory();
  }
}

