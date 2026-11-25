import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  BatchSyncInspectionsInput,
  BatchSyncInspectionsSchema,
  BatchSyncReceivingInput,
  BatchSyncReceivingSchema,
} from '@opstrace/validation';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SyncService } from './sync.service';

@Controller('api/v1/sync')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('receiving')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.RECEIPT_SUBMIT)
  syncReceiving(
    @Body(new ZodValidationPipe(BatchSyncReceivingSchema))
    body: BatchSyncReceivingInput,
  ) {
    return this.syncService.syncReceiving(body);
  }

  @Post('inspections')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.INSPECTION_PERFORM)
  syncInspections(
    @Body(new ZodValidationPipe(BatchSyncInspectionsSchema))
    body: BatchSyncInspectionsInput,
  ) {
    return this.syncService.syncInspections(body);
  }
}
