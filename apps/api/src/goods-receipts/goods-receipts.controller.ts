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
  GoodsReceiptQueryInput,
  GoodsReceiptQuerySchema,
  SubmitGoodsReceiptInput,
  SubmitGoodsReceiptSchema,
} from '@opstrace/validation';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { GoodsReceiptsService } from './goods-receipts.service';

/**
 * Goods Receipts controller.
 *
 * All routes require JWT authentication and appropriate permissions.
 * JwtAuthGuard populates TenantContext before any service method runs,
 * ensuring every database query is scoped to the authenticated user's organization.
 */
@Controller('api/v1/goods-receipts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GoodsReceiptsController {
  constructor(private readonly goodsReceiptsService: GoodsReceiptsService) {}

  /**
   * POST /api/v1/goods-receipts
   *
   * Submit a new Goods Receipt for a Purchase Order.
   * Triggers the full reconciliation pipeline inside a single transaction.
   *
   * PERMISSION: receipt:submit
   * IDEMPOTENCY: Clients must supply a stable UUID idempotencyKey.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.RECEIPT_SUBMIT)
  submit(
    @Body(new ZodValidationPipe(SubmitGoodsReceiptSchema))
    body: SubmitGoodsReceiptInput,
  ) {
    return this.goodsReceiptsService.submit(body);
  }

  /**
   * GET /api/v1/goods-receipts
   *
   * Paginated list of Goods Receipts with optional filters.
   * Filters: purchaseOrderId, warehouseId, status.
   *
   * PERMISSION: receipt:view
   */
  @Get()
  @RequirePermissions(PERMISSIONS.RECEIPT_VIEW)
  findAll(
    @Query(new ZodValidationPipe(GoodsReceiptQuerySchema))
    query: GoodsReceiptQueryInput,
  ) {
    return this.goodsReceiptsService.findAll(query);
  }

  /**
   * GET /api/v1/goods-receipts/:id
   *
   * Retrieve a single Goods Receipt with its line items.
   *
   * PERMISSION: receipt:view
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.RECEIPT_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.goodsReceiptsService.findOne(id);
  }
}
