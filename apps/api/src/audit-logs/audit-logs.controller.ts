import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditLogQueryInput, AuditLogQuerySchema } from '@opstrace/validation';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';

@Controller('api/v1/audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  findAll(
    @Query(new ZodValidationPipe(AuditLogQuerySchema))
    query: AuditLogQueryInput,
  ) {
    return this.auditLogsService.findAll(query);
  }
}
