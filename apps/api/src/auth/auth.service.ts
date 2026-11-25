import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterUserInput, LoginInput } from '@opstrace/validation';
import { MembershipStatus, RoleName } from '@opstrace/shared-types';
import { ROLE_PERMISSIONS, PERMISSIONS } from '../common/constants/permissions.constant';

/** Number of bcrypt salt rounds. 12 is the recommended minimum for 2024+. */
const BCRYPT_ROUNDS = 12;

export interface AuthTokenPayload {
  accessToken: string;
  userId: string;
  email: string;
  organizationId: string;
  role: string;
}

export interface MeResponse {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  organizationName: string;
  role: string;
  permissions: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Registers a new user and bootstraps their organization in a single atomic
   * database transaction.
   *
   * TRANSACTION STRATEGY (rules.md §2):
   * All of the following must succeed together or none is committed:
   *   1. Create the User record with a hashed password.
   *   2. Create the Organization record with a URL-safe slug.
   *   3. Seed all system Permission records (idempotent via upsert).
   *   4. Create all five system Roles for the new organization.
   *   5. Assign the correct permission set to each role (role_permissions).
   *   6. Create the Admin Membership linking the user to the organization.
   *
   * WHY ONE TRANSACTION?
   * If the process crashes after creating the user but before creating the
   * membership, that user would have no organization and would be locked out.
   * The transaction guarantees the data is always in a consistent state.
   *
   * @throws ConflictException if the email is already registered.
   */
  async register(input: RegisterUserInput): Promise<AuthTokenPayload> {
    // Pre-check outside the transaction to give a friendly error message.
    // Note: There is a theoretical TOCTOU race here — the unique constraint
    // on users.email is the authoritative guard.
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException(`Email ${input.email} is already registered`);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const slug = this.buildSlug(input.organizationName);

    const { user, organization } = await this.prisma.$transaction(
      async (tx) => {
        // ── 1. Create User ──────────────────────────────────────────────────
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
          },
        });

        // ── 2. Create Organization ─────────────────────────────────────────
        const organization = await tx.organization.create({
          data: {
            name: input.organizationName,
            slug: `${slug}-${Date.now()}`, // Ensure uniqueness across registrations
          },
        });

        // ── 3. Seed all Permission records (idempotent) ────────────────────
        const allPermissionValues = Object.values(PERMISSIONS);
        for (const key of allPermissionValues) {
          await tx.permission.upsert({
            where: { key },
            update: {},
            create: { key, description: `Permission: ${key}` },
          });
        }

        // Fetch all seeded permissions for role-permission assignment
        const allPermissions = await tx.permission.findMany({
          where: { key: { in: allPermissionValues } },
        });
        const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

        // ── 4 & 5. Create all system Roles + assign their permissions ────────
        const roleNames = Object.values(RoleName);
        const createdRoles: Record<string, { id: string }> = {};

        for (const roleName of roleNames) {
          const role = await tx.role.create({
            data: {
              organizationId: organization.id,
              name: roleName,
              description: `System role: ${roleName}`,
            },
          });
          createdRoles[roleName] = role;

          const permKeys = ROLE_PERMISSIONS[roleName] ?? [];
          for (const permKey of permKeys) {
            const permission = permissionByKey.get(permKey);
            if (permission) {
              await tx.rolePermission.create({
                data: { roleId: role.id, permissionId: permission.id },
              });
            }
          }
        }

        const adminRole = createdRoles[RoleName.ORG_ADMIN];
        if (!adminRole) {
          throw new Error('Failed to create ORG_ADMIN role during registration');
        }

        // ── 6. Create Admin Membership ─────────────────────────────────────
        await tx.membership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            roleId: adminRole.id,
            status: MembershipStatus.ACTIVE,
          },
        });

        return { user, organization, adminRole };
      },
    );

    this.logger.log(
      `Registered user ${user.id} as Admin of organization ${organization.id}`,
    );

    const accessToken = this.signJwt(user.id, user.email, organization.id);
    return {
      accessToken,
      userId: user.id,
      email: user.email,
      organizationId: organization.id,
      role: RoleName.ORG_ADMIN,
    };
  }

  /**
   * Authenticates a user and returns a signed JWT.
   *
   * SECURITY RULE:
   * - We always call bcrypt.compare(), even when no user is found, to prevent
   *   timing attacks that would reveal whether an email is registered.
   * - Only ACTIVE memberships are considered valid. Suspended users receive 401.
   *
   * @throws UnauthorizedException on any credential failure.
   */
  async login(input: LoginInput): Promise<AuthTokenPayload> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    // Use a dummy hash to maintain constant-time comparison
    const dummyHash = '$2b$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const isMatch = await bcrypt.compare(
      input.password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !isMatch || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Fetch the most recent ACTIVE membership (supports future multi-org users)
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      include: {
        role: true,
        organization: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!membership) {
      throw new UnauthorizedException(
        'Your account has no active organization membership. Contact your administrator.',
      );
    }

    this.logger.log(
      `User ${user.id} logged in to organization ${membership.organizationId}`,
    );

    const accessToken = this.signJwt(user.id, user.email, membership.organizationId);
    return {
      accessToken,
      userId: user.id,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role.name,
    };
  }

  /**
   * Returns the authenticated user's profile and their resolved permission set.
   * Used by GET /api/v1/auth/me after JwtAuthGuard populates req.user.
   *
   * We re-fetch from the DB (not from the token) so the response always
   * reflects the current role and permissions, even if changed since login.
   */
  async getMe(userId: string, organizationId: string): Promise<MeResponse> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        user: true,
        organization: true,
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException('Active membership not found');
    }

    return {
      userId: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      role: membership.role.name,
      permissions: membership.role.rolePermissions.map((rp) => rp.permission.key),
    };
  }

  /** Signs a JWT containing the minimum necessary claims for auth/authz. */
  private signJwt(userId: string, email: string, organizationId: string): string {
    return this.jwtService.sign({
      sub: userId,
      email,
      organizationId,
    });
  }

  /**
   * Converts an organization name to a URL-safe lowercase slug.
   * e.g. "Acme Distribution Inc." → "acme-distribution-inc"
   */
  private buildSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
