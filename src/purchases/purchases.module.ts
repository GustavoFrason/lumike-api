import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    providers: [PurchasesService],
    controllers: [PurchasesController],
    exports: [PurchasesService],
})
export class PurchasesModule { }
