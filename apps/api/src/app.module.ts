import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { TenantContextInterceptor } from './prisma/tenant-context.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthModule } from './auth/auth.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ImportsModule } from './imports/imports.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { ExceptionsModule } from './exceptions/exceptions.module';
import { StockInspectionsModule } from './stock-inspections/stock-inspections.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { SyncModule } from './sync/sync.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    WarehousesModule,
    ProductsModule,
    SuppliersModule,
    PurchaseOrdersModule,
    ImportsModule.register(),
    GoodsReceiptsModule,
    ExceptionsModule,
    StockInspectionsModule,
    AuditLogsModule,
    AttachmentsModule,
    SyncModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
