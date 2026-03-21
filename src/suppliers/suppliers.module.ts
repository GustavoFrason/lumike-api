import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [SupabaseModule],
    providers: [SuppliersService],
    controllers: [SuppliersController],
    exports: [SuppliersService],
})
export class SuppliersModule { }
