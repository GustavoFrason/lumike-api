import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AccountsReceivableService } from './accounts-receivable.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import type { AuthUser } from '../auth/types/auth-user.type';

/** Contas a receber: dado financeiro sensível, só admin/gestor. */
@Roles(...MANAGEMENT_ROLES)
@Controller('accounts-receivable')
export class AccountsReceivableController {
  constructor(private readonly service: AccountsReceivableService) {}

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
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.markAsPaid(
      +orderId,
      amount,
      paymentMethod || 'dinheiro',
      user,
    );
  }
}
