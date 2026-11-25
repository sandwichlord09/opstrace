import { SetMetadata } from '@nestjs/common';
import { Permission } from '../constants/permissions.constant';

/**
 * Metadata key used by PermissionsGuard to read required permissions.
 * Using a Symbol prevents accidental key collisions with other decorators.
 */
export const PERMISSIONS_KEY = 'required_permissions';

/**
 * @RequirePermissions(...perms) — Route decorator for server-side authorization.
 *
 * Usage:
 * ```ts
 * @Get('/exceptions')
 * @RequirePermissions(PERMISSIONS.EXCEPTION_VIEW)
 * listExceptions() { ... }
 * ```
 *
 * SECURITY INTENT:
 * This decorator does NOT enforce anything on its own. It simply attaches
 * metadata to the route handler. The PermissionsGuard reads this metadata
 * during the request lifecycle and rejects callers whose JWT payload does
 * not include every listed permission key.
 *
 * Both the decorator AND the guard must be present for a route to be protected.
 * Never rely on the decorator alone.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
