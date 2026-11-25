import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  StockInspectionQueryInput,
  StockInspectionQuerySchema,
  SubmitStockInspectionInput,
  SubmitStockInspectionSchema,
} from '@opstrace/validation';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { StockInspectionsService } from './stock-inspections.service';

@Controller('api/v1/stock-inspections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockInspectionsController {
  constructor(
    private readonly stockInspectionsService: StockInspectionsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.INSPECTION_PERFORM)
  submit(
    @Body(new ZodValidationPipe(SubmitStockInspectionSchema))
    body: SubmitStockInspectionInput,
  ) {
    return this.stockInspectionsService.submit(body);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INSPECTION_REVIEW)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockInspectionsService.approve(id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INSPECTION_VIEW)
  findAll(
    @Query(new ZodValidationPipe(StockInspectionQuerySchema))
    query: StockInspectionQueryInput,
  ) {
    return this.stockInspectionsService.findAll(query);
  }
}
