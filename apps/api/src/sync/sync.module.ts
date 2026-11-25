import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoodsReceiptsModule } from '../goods-receipts/goods-receipts.module';
import { StockInspectionsModule } from '../stock-inspections/stock-inspections.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, GoodsReceiptsModule, StockInspectionsModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
