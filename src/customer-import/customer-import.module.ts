/**
 * CustomerImportModule
 * --------------------
 * Carga de clientes via planilha Excel. `SUPABASE_CLIENT` vem do
 * SupabaseModule (@Global). Não depende de mais nada — `customers` não tem
 * trigger nem regra configurável.
 */

import { Module } from '@nestjs/common';
import { CustomerImportController } from './customer-import.controller';
import { CustomerImportService } from './customer-import.service';

@Module({
  controllers: [CustomerImportController],
  providers: [CustomerImportService],
})
export class CustomerImportModule {}
