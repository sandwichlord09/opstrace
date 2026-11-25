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
  AddExceptionCommentInput,
  AddExceptionCommentSchema,
  AssignExceptionInput,
  AssignExceptionSchema,
  ExceptionQueryInput,
  ExceptionQuerySchema,
  ResolveExceptionInput,
  ResolveExceptionSchema,
} from '@opstrace/validation';
import { PERMISSIONS } from '../common/constants/permissions.constant';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ExceptionsService } from './exceptions.service';

@Controller('api/v1/exceptions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExceptionsController {
  constructor(private readonly exceptionsService: ExceptionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EXCEPTION_VIEW)
  findAll(
    @Query(new ZodValidationPipe(ExceptionQuerySchema))
    query: ExceptionQueryInput,
  ) {
    return this.exceptionsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EXCEPTION_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.exceptionsService.findOne(id);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.EXCEPTION_ASSIGN)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignExceptionSchema))
    body: AssignExceptionInput,
  ) {
    return this.exceptionsService.assign(id, body);
  }

  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.EXCEPTION_COMMENT)
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddExceptionCommentSchema))
    body: AddExceptionCommentInput,
  ) {
    return this.exceptionsService.addComment(id, body);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.EXCEPTION_RESOLVE)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResolveExceptionSchema))
    body: ResolveExceptionInput,
  ) {
    return this.exceptionsService.resolve(id, body);
  }
}
