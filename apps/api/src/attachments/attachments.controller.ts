import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  PresignAttachmentInput,
  PresignAttachmentSchema,
} from '@opstrace/validation';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AttachmentsService } from './attachments.service';

@Controller('api/v1/attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.RECEIPT_SUBMIT)
  presign(
    @Body(new ZodValidationPipe(PresignAttachmentSchema))
    body: PresignAttachmentInput,
  ) {
    return this.attachmentsService.presignUpload(body);
  }

  @Get(':id/download-url')
  @RequirePermissions(PERMISSIONS.EXCEPTION_VIEW)
  getDownloadUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachmentsService.getDownloadUrl(id);
  }
}
