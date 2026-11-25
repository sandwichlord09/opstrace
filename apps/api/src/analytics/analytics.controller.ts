import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsQueryInput, AnalyticsQuerySchema } from '@opstrace/validation';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  getOverview(
    @Query(new ZodValidationPipe(AnalyticsQuerySchema))
    query: AnalyticsQueryInput,
  ) {
    return this.analyticsService.getOverview(query);
  }

  @Get('discrepancies')
  @RequirePermissions(PERMISSIONS.REPORTS_VIEW)
  getDiscrepancies(
    @Query(new ZodValidationPipe(AnalyticsQuerySchema))
    query: AnalyticsQueryInput,
  ) {
    return this.analyticsService.getDiscrepancies(query);
  }
}
