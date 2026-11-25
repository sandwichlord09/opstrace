import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../prisma/tenant-context';
import { MembershipStatus, UserContext } from '@opstrace/shared-types';

interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
}

/**
 * JwtAuthGuard — The first line of multi-tenant defense.
 *
 * This guard does three things in order:
 *
 * 1. VERIFY TOKEN: Validates the JWT signature and expiration.
 *    A tampered or expired token is rejected immediately (401).
 *
 * 2. VERIFY ACTIVE MEMBERSHIP: Even with a valid JWT, the user must have an
 *    ACTIVE membership in the organization encoded in the token's payload.
 *    This prevents:
 *    - Suspended users from using old tokens that haven't expired yet.
 *    - A user from fabricating a token for an organization they never joined.
 *
 * 3. POPULATE TENANT CONTEXT: Sets the user's identity — including their
 *    organizationId and permission list — into the AsyncLocalStorage context
 *    so all downstream services and Prisma queries can read it without needing
 *    it passed as a parameter.
 *
 * HOW CROSS-TENANT ISOLATION IS ENFORCED STRUCTURALLY:
 * - The organizationId inside the JWT came from the database at login time and
 *   cannot be changed by the client (the token is signed with HS256).
 * - Step 2 re-validates against the live memberships table on every request,
 *   so revocations (suspensions) take effect immediately.
 * - Step 3 places the organizationId in TenantContext; services read it from
 *   there, NOT from the HTTP request body, making spoofing impossible.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user: UserContext;
      tenantRunCallback?: () => Promise<boolean>;
    }>();

    // ── Step 1: Extract & verify JWT ────────────────────────────────────────
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    // ── Step 2: Verify active membership in the claimed organization ─────────
    // We re-query the DB on every request so suspensions apply immediately,
    // even when the JWT has not yet expired.
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: payload.sub,
        organizationId: payload.organizationId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException(
        'You do not have an active membership in this organization',
      );
    }

    // ── Step 3: Build UserContext and attach to request & TenantContext ───────
    const permissions = membership.role.rolePermissions.map(
      (rp) => rp.permission.key,
    );

    const userContext: UserContext = {
      userId: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      roles: [membership.role.name],
      permissions,
    };

    // Attach to req.user for the @CurrentUser() decorator
    request.user = userContext;

    // Enter the TenantContext for the remainder of this HTTP request so all
    // downstream services can call tenantContext.getOrganizationId() safely.
    this.tenantContext.enter(userContext);
    return true;
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.slice(7);
  }
}
