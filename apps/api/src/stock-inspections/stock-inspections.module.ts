import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StockInspectionsController } from './stock-inspections.controller';
import { StockInspectionsService } from './stock-inspections.service';

@Module({
  imports: [AuthModule],
  controllers: [StockInspectionsController],
  providers: [StockInspectionsService],
  exports: [StockInspectionsService],
})
export class StockInspectionsModule {}
