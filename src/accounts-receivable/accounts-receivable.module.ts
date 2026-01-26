import { Module } from '@nestjs/common';
import { AccountsReceivableService } from './accounts-receivable.service';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { CashFlowModule } from '../cash-flow/cash-flow.module';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
    imports: [CashFlowModule, SupabaseModule],
    controllers: [AccountsReceivableController],
    providers: [AccountsReceivableService],
})
export class AccountsReceivableModule { }
