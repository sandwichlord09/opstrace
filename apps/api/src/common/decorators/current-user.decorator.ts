import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserContext } from '@opstrace/shared-types';

/**
 * @CurrentUser() — Parameter decorator that extracts the authenticated user
 * from the request object as populated by JwtAuthGuard.
 *
 * Usage:
 * ```ts
 * @Get('/me')
 * getMe(@CurrentUser() user: UserContext) { ... }
 * ```
 *
 * This keeps controllers thin: they receive a typed user object rather than
 * digging into `req.user` manually.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext => {
    const request = ctx.switchToHttp().getRequest<{ user: UserContext }>();
    return request.user;
  },
);
