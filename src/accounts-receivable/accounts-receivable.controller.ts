import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AccountsReceivableService } from './accounts-receivable.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('accounts-receivable')
@UseGuards(JwtAuthGuard)
export class AccountsReceivableController {
    constructor(private readonly service: AccountsReceivableService) { }

    @Get()
    getDebtors() {
        return this.service.getDebtors();
    }

    @Get('statement/:customerId')
    getCustomerStatement(@Param('customerId') customerId: string) {
        return this.service.getCustomerStatement(+customerId);
    }

    @Get('history/:orderId')
    getOrderPayments(@Param('orderId') orderId: string) {
        return this.service.getOrderPayments(+orderId);
    }

    @Post('pay/:orderId')
    markAsPaid(
        @Param('orderId') orderId: string,
        @Body('amount') amount: number,
        @Body('payment_method') paymentMethod: string,
        @CurrentUser() user: any
    ) {
        return this.service.markAsPaid(+orderId, amount, paymentMethod || 'dinheiro', user);
    }
}
