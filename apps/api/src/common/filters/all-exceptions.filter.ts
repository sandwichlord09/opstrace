import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter that logs full stack traces for unexpected errors
 * and returns clean, structured JSON HTTP responses.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        body = {
          statusCode: status,
          timestamp: new Date().toISOString(),
          path: request.url,
          message: exceptionResponse,
        };
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        body = {
          statusCode: status,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(exceptionResponse as Record<string, unknown>),
        };
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `Unhandled non-Error exception on ${request.method} ${request.url}: ${String(exception)}`,
      );
    }

    response.status(status).json(body);
  }
}
