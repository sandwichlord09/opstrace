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
  CreateProductInput,
  CreateProductSchema,
  ProductQueryInput,
  ProductQuerySchema,
  UpdateProductInput,
  UpdateProductSchema,
} from '@opstrace/validation';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProductsService } from './products.service';

@Controller('api/v1/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  create(
    @Body(new ZodValidationPipe(CreateProductSchema)) body: CreateProductInput,
  ) {
    return this.productsService.create(body);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  findAll(
    @Query(new ZodValidationPipe(ProductQuerySchema)) query: ProductQueryInput,
  ) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: UpdateProductInput,
  ) {
    return this.productsService.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_MANAGE)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.deactivate(id);
  }
}
