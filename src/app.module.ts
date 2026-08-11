import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
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
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { PurchaseImportModule } from './purchase-import/purchase-import.module';
import { WarrantiesModule } from './warranties/warranties.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // .env.local (não versionado) tem prioridade sobre .env — permite apontar
    // pro Supabase local (`supabase start`, ver supabase/config.toml) sem
    // tocar no .env "real" que aponta pra nuvem.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    // Limite global: 100 req/min por IP. Rotas específicas (login, register,
    // captura de lead) usam @Throttle() com limites mais restritos — ver
    // seus controllers.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
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
    SuppliersModule,
    PurchasesModule,
    PurchaseImportModule,
    WarrantiesModule,
    UsersModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    // Ordem importa: ThrottlerGuard rejeita tráfego abusivo antes de gastar
    // ciclo com verificação de JWT; JwtAuthGuard popula request.user antes
    // do RolesGuard rodar.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
