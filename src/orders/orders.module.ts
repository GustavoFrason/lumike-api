import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { SettingsModule } from '../settings/settings.module';

// InventoryModule/CashFlowModule não são mais importados aqui: a baixa de
// estoque e o lançamento de caixa da criação/cancelamento de pedido agora
// acontecem dentro da função atômica fn_create_order/fn_cancel_order no
// Postgres, não mais via chamada direta a esses services (ver orders.service.ts).
@Module({
  imports: [SettingsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
