import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { CollectionsModule } from './collections/collections.module';
import { InventoryModule } from './inventory/inventory.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { SettingsModule } from './settings/settings.module';
import { LeadsModule } from './leads/leads.module';
import { FavoritesModule } from './favorites/favorites.module';
import { StockNotificationsModule } from './stock-notifications/stock-notifications.module';
import { AccessoryPurchasesModule } from './accessory-purchases/accessory-purchases.module';
import { AccountsReceivableModule } from './accounts-receivable/accounts-receivable.module';
import { CashFlowModule } from './cash-flow/cash-flow.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    CollectionsModule,
    InventoryModule,
    DashboardModule,
    CustomersModule,
    OrdersModule,
    SettingsModule,
    LeadsModule,
    FavoritesModule,
    StockNotificationsModule,
    AccessoryPurchasesModule,
    AccountsReceivableModule,
    CashFlowModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule { }