import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
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
  ],
})
export class AppModule {}
