/**
 * PurchaseImportModule
 * --------------------
 * Define o módulo de importação de compra via planilha Excel (Zarpellon).
 */

import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PurchaseImportController } from './purchase-import.controller';
import { PurchaseImportService } from './purchase-import.service';

@Module({
  imports: [SettingsModule],
  controllers: [PurchaseImportController],
  providers: [PurchaseImportService],
})
export class PurchaseImportModule {}
