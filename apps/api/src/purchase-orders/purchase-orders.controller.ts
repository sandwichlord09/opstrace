import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePurchaseOrderInput,
  CreatePurchaseOrderSchema,
  PurchaseOrderQueryInput,
  PurchaseOrderQuerySchema,
  UpdatePurchaseOrderInput,
  UpdatePurchaseOrderSchema,
} from '@opstrace/validation';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('api/v1/purchase-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PO_CREATE)
  create(
    @Body(new ZodValidationPipe(CreatePurchaseOrderSchema))
    body: CreatePurchaseOrderInput,
  ) {
    return this.purchaseOrdersService.create(body);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PO_VIEW)
  findAll(
    @Query(new ZodValidationPipe(PurchaseOrderQuerySchema))
    query: PurchaseOrderQueryInput,
  ) {
    return this.purchaseOrdersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PO_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PO_CREATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePurchaseOrderSchema))
    body: UpdatePurchaseOrderInput,
  ) {
    return this.purchaseOrdersService.update(id, body);
  }

  @Patch(':id/issue')
  @RequirePermissions(PERMISSIONS.PO_CREATE)
  issue(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.issue(id);
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.PO_CANCEL)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrdersService.cancel(id);
  }
}
