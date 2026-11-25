import {
  Body,
  Controller,
  Delete,
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
  CreateSupplierInput,
  CreateSupplierSchema,
  SupplierQueryInput,
  SupplierQuerySchema,
  UpdateSupplierInput,
  UpdateSupplierSchema,
} from '@opstrace/validation';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SuppliersService } from './suppliers.service';

@Controller('api/v1/suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  create(
    @Body(new ZodValidationPipe(CreateSupplierSchema))
    body: CreateSupplierInput,
  ) {
    return this.suppliersService.create(body);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_VIEW)
  findAll(
    @Query(new ZodValidationPipe(SupplierQuerySchema))
    query: SupplierQueryInput,
  ) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSupplierSchema))
    body: UpdateSupplierInput,
  ) {
    return this.suppliersService.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_MANAGE)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.deactivate(id);
  }
}
