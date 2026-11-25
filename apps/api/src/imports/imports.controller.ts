import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { ImportsService } from './imports.service';

@Controller('api/v1/imports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('purchase-orders')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(PERMISSIONS.PO_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  uploadPurchaseOrders(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file is required under field "file"');
    }

    return this.importsService.enqueuePurchaseOrderImport(
      file.originalname,
      file.buffer.toString('utf-8'),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PO_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.importsService.findOne(id);
  }
}
