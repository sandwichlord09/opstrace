import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserContext } from '@opstrace/shared-types';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { Permission } from '../constants/permissions.constant';

/**
 * PermissionsGuard — Enforces fine-grained route-level authorization.
 *
 * MUST be used AFTER JwtAuthGuard in the guard chain, because it reads
 * `request.user.permissions` which JwtAuthGuard populates.
 *
 * HOW IT WORKS:
 * 1. The reflector reads the `@RequirePermissions(...)` metadata from the
 *    route handler.
 * 2. It compares the route's required permissions against the caller's
 *    permission list (loaded from the DB at login and embedded in `req.user`).
 * 3. If the caller is missing ANY required permission, the request is rejected
 *    with a 403 Forbidden — not 401, because the user IS authenticated but
 *    is NOT authorized for this specific action.
 *
 * SECURITY INTENT:
 * - Permission checks happen server-side on every request; frontend hiding
 *   of UI elements is cosmetic only and does NOT replace this guard.
 * - An Auditor calling an Admin-only endpoint will be rejected here even if
 *   they somehow obtain a valid JWT.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read required permissions from route metadata
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @RequirePermissions decorator is present, allow access.
    // Public routes or routes guarded only by JwtAuthGuard fall into this path.
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: UserContext }>();
    const user = request.user;

    // Check that the authenticated user holds every required permission.
    // We use `every` (not `some`) — a route requiring multiple permissions
    // means the user must have ALL of them.
    const hasAll = requiredPermissions.every((perm) =>
      user.permissions.includes(perm),
    );

    if (!hasAll) {
      throw new ForbiddenException(
        `You do not have permission to perform this action. ` +
          `Required: [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
