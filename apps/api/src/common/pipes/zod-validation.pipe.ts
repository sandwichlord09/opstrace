import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * ZodValidationPipe — Validates incoming request bodies against a Zod schema.
 *
 * Usage: @Body(new ZodValidationPipe(MySchema))
 *
 * WHY ZOD INSTEAD OF class-validator?
 * We use Zod schemas from @opstrace/validation (shared across API, Web, Mobile).
 * This means validation logic is defined once and cannot diverge between the
 * mobile app and the API server, eliminating a whole class of data integrity bugs.
 *
 * If validation fails, NestJS returns 400 Bad Request with structured
 * error messages from Zod's format() output.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
