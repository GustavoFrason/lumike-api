/**
 * TransferBatchesModule
 * --------------------
 * Transferência de peças em lote entre estoques. `SUPABASE_CLIENT` vem do
 * SupabaseModule (@Global).
 */

import { Module } from '@nestjs/common';
import { TransferBatchesController } from './transfer-batches.controller';
import { TransferBatchesService } from './transfer-batches.service';

@Module({
  controllers: [TransferBatchesController],
  providers: [TransferBatchesService],
})
export class TransferBatchesModule {}
