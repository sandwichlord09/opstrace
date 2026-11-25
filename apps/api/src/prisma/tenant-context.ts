import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';
import { UserContext } from '@opstrace/shared-types';

/**
 * TenantContext uses Node.js AsyncLocalStorage to store the authenticated
 * user's identity — including their organizationId — for the full duration
 * of a single HTTP request, without passing it through every function call.
 *
 * SECURITY MODEL:
 * - The JwtAuthGuard calls `set()` exactly once per request, after the JWT
 *   is validated and the membership is verified in the database.
 * - Any service that needs `organizationId` calls `get()` to retrieve it.
 * - Because AsyncLocalStorage is scoped to the Node.js async context of
 *   the incoming request, two concurrent requests CANNOT see each other's
 *   tenant context, preventing accidental cross-tenant data leaks.
 *
 * HOW CROSS-TENANT LEAKS ARE PREVENTED STRUCTURALLY:
 * - Services do NOT accept organizationId as a parameter (which could be
 *   spoofed by a caller). Instead they call `tenantContext.getOrFail()`.
 * - `getOrFail()` throws immediately if called outside a request context
 *   (e.g., from a background job that bypassed the guard), making bugs visible
 *   during development rather than silently leaking data.
 * - Every tenant-scoped Prisma query uses the organizationId from this context
 *   as a mandatory `where` clause, so the database enforces the boundary too.
 */
@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<UserContext>();

  /**
   * Called by JwtAuthGuard after the JWT is verified and the membership
   * is confirmed active. The callback runs inside the ALS context, so all
   * downstream code (services, Prisma queries) can read the tenant identity.
   */
  run<T>(userContext: UserContext, callback: () => T): T {
    return this.storage.run(userContext, callback);
  }

  /**
   * Returns the current user context, or undefined if called outside a
   * request (e.g., from background jobs or tests that set up context manually).
   */
  get(): UserContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Returns the current user context, throwing if it is absent.
   * Services should call this — not `get()` — to get a hard compile-time
   * and runtime guarantee that organizational scoping is always present.
   *
   * @throws Error if called outside a valid authenticated request context.
   */
  getOrFail(): UserContext {
    const ctx = this.storage.getStore();
    if (!ctx) {
      throw new Error(
        'TenantContext: No user context found in the current async scope. ' +
          'Ensure this code path is only called from within an HTTP request ' +
          'handler that has passed through JwtAuthGuard.',
      );
    }
    return ctx;
  }

  /**
   * Convenience shortcut that returns only the organizationId.
   * This is what most Prisma queries need.
   */
  getOrganizationId(): string {
    return this.getOrFail().organizationId;
  }
}
