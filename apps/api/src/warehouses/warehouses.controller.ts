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
  CreateWarehouseInput,
  CreateWarehouseSchema,
  UpdateWarehouseInput,
  UpdateWarehouseSchema,
  WarehouseQueryInput,
  WarehouseQuerySchema,
} from '@opstrace/validation';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WarehousesService } from './warehouses.service';

@Controller('api/v1/warehouses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.WAREHOUSES_MANAGE)
  create(
    @Body(new ZodValidationPipe(CreateWarehouseSchema))
    body: CreateWarehouseInput,
  ) {
    return this.warehousesService.create(body);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.WAREHOUSES_VIEW)
  findAll(
    @Query(new ZodValidationPipe(WarehouseQuerySchema))
    query: WarehouseQueryInput,
  ) {
    return this.warehousesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.WAREHOUSES_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.WAREHOUSES_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateWarehouseSchema))
    body: UpdateWarehouseInput,
  ) {
    return this.warehousesService.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.WAREHOUSES_MANAGE)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.deactivate(id);
  }
}
