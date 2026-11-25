import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserContext } from '@opstrace/shared-types';
import { TenantContext } from './tenant-context';

/**
 * TenantContextInterceptor — Guarantees AsyncLocalStorage tenant scoping
 * across the entire NestJS controller/service execution pipeline.
 *
 * WHY THIS IS NEEDED:
 * `JwtAuthGuard.canActivate()` runs as an `async` Promise. Calling
 * `AsyncLocalStorage.enterWith()` inside `canActivate()` does NOT persist
 * back out to NestJS's outer `RouterExecutionContext` after the guard
 * Promise resolves. Wrapping `next.handle()` inside `tenantContext.run()`
 * ensures the store is bound for pipes, controllers, services, and Prisma
 * transactions on every authenticated request.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: UserContext }>();
    const user = request?.user;

    if (!user) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      let subscription: { unsubscribe: () => void } | undefined;

      this.tenantContext.run(user, () => {
        subscription = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });

      return () => {
        subscription?.unsubscribe();
      };
    });
  }
}
