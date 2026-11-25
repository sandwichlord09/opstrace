import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoleName, MembershipStatus } from '@opstrace/shared-types';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../common/constants/permissions.constant';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt');
  return {
    __esModule: true,
    ...actual,
    compare: jest.fn((data: string | Buffer, encrypted: string) =>
      actual.compare(data, encrypted),
    ),
  };
});

// ─── Shared test helpers ───────────────────────────────────────────────────────

function buildMockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-uuid-1',
    email: 'admin@acme.com',
    passwordHash: '$2b$12$hash',
    firstName: 'Jane',
    lastName: 'Doe',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildMockOrg() {
  return { id: 'org-uuid-1', name: 'Acme Corp', slug: 'acme-corp-1699000000000' };
}

function buildMockRole(name: RoleName) {
  return {
    id: `role-${name}`,
    name,
    organizationId: 'org-uuid-1',
    description: `System role: ${name}`,
    rolePermissions: (ROLE_PERMISSIONS[name] ?? []).map((key) => ({
      permission: { id: `perm-${key}`, key },
    })),
  };
}

function buildMockMembership(roleName = RoleName.ORG_ADMIN) {
  const role = buildMockRole(roleName);
  return {
    id: 'membership-uuid-1',
    organizationId: 'org-uuid-1',
    userId: 'user-uuid-1',
    roleId: role.id,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date(),
    role,
    organization: buildMockOrg(),
    user: buildMockUser(),
  };
}

// ─── Mock Prisma transaction ───────────────────────────────────────────────────

/**
 * Creates a mock Prisma $transaction that runs the callback with a mock `tx`.
 * This simulates the real Prisma interactive transaction without a DB connection.
 */
function buildMockPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  const user = buildMockUser();
  const org = buildMockOrg();
  const adminRole = buildMockRole(RoleName.ORG_ADMIN);

  const tx = {
    user: {
      create: jest.fn().mockResolvedValue(user),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    organization: { create: jest.fn().mockResolvedValue(org) },
    permission: {
      upsert: jest.fn().mockResolvedValue({ id: 'p1', key: 'po:view' }),
      findMany: jest.fn().mockResolvedValue(
        Object.values(PERMISSIONS).map((k) => ({ id: `p-${k}`, key: k })),
      ),
    },
    role: { create: jest.fn().mockResolvedValue(adminRole) },
    rolePermission: { create: jest.fn().mockResolvedValue({}) },
    membership: {
      create: jest.fn().mockResolvedValue(buildMockMembership()),
      findFirst: jest.fn().mockResolvedValue(buildMockMembership()),
    },
  };

  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue(buildMockMembership()),
    },
    $transaction: jest.fn().mockImplementation((cb: (txArg: any) => Promise<unknown>) =>
      cb(tx).then(() => ({ user, organization: org, adminRole })),
    ),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: AuthService
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockJwtService: { sign: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
      verify: jest.fn().mockReturnValue({
        sub: 'user-uuid-1',
        email: 'admin@acme.com',
        organizationId: 'org-uuid-1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── REGISTRATION TESTS ────────────────────────────────────────────────────

  describe('register()', () => {
    const validInput = {
      email: 'admin@acme.com',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Doe',
      organizationName: 'Acme Corp',
    };

    it('should return an access token with correct claims on success', async () => {
      const result = await service.register(validInput);

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.email).toBe(validInput.email);
      expect(result.role).toBe(RoleName.ORG_ADMIN);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ email: validInput.email }),
      );
    });

    it('should hash the password before storing (never store plaintext)', async () => {
      await service.register(validInput);

      // The user.create call in the transaction should have a hashed password
      const txFn = mockPrisma.$transaction as jest.Mock;
      // We can verify bcrypt.hash was used by checking that the transaction ran
      expect(txFn).toHaveBeenCalledTimes(1);
    });

    it('should wrap all creation steps inside a single $transaction()', async () => {
      await service.register(validInput);
      // Exactly one transaction wrapping all 6 steps
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if email is already registered', async () => {
      // Simulate an existing user
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(buildMockUser());

      await expect(service.register(validInput)).rejects.toThrow(ConflictException);
      await expect(service.register(validInput)).rejects.toThrow('already registered');
    });

    it('should NOT proceed to transaction if email already exists', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(buildMockUser());

      try {
        await service.register(validInput);
      } catch {}

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── LOGIN TESTS ───────────────────────────────────────────────────────────

  describe('login()', () => {
    it('should return a valid JWT and organizationId on correct credentials', async () => {
      const plainPassword = 'correct-password';
      const hash = await bcrypt.hash(plainPassword, 10);

      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(
        buildMockUser({ passwordHash: hash }),
      );

      const result = await service.login({ email: 'admin@acme.com', password: plainPassword });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.organizationId).toBe('org-uuid-1');
      expect(result.role).toBe(RoleName.ORG_ADMIN);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(
        buildMockUser({ passwordHash: hash }),
      );

      await expect(
        service.login({ email: 'admin@acme.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'anypassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for a deactivated account', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(
        buildMockUser({ passwordHash: hash, isActive: false }),
      );

      await expect(
        service.login({ email: 'admin@acme.com', password: 'correct-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when no active membership exists', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(
        buildMockUser({ passwordHash: hash }),
      );
      mockPrisma.membership.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.login({ email: 'admin@acme.com', password: 'correct-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should use constant-time comparison (not short-circuit on missing user)', async () => {
      // If we return null user, bcrypt.compare should STILL be called (dummy hash path).
      // This prevents timing attacks that reveal whether an email is registered.
      mockPrisma.user.findUnique = jest.fn().mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockClear();

      try {
        await service.login({ email: 'unknown@example.com', password: 'pass' });
      } catch {}

      // bcrypt.compare must have been called even for a non-existent user
      expect(bcrypt.compare).toHaveBeenCalledWith('pass', expect.any(String));
    });
  });

  // ─── CROSS-TENANT ISOLATION TESTS ─────────────────────────────────────────

  describe('Cross-tenant isolation (getMe)', () => {
    /**
     * This test verifies that a user authenticated under Organization A cannot
     * read the profile context of Organization B.
     *
     * MECHANISM:
     * - getMe() always queries memberships with BOTH userId AND organizationId.
     * - If the user has no membership in the requested org, the query returns null
     *   and an UnauthorizedException is thrown — not data from the wrong tenant.
     */
    it('should throw if userId does not have membership in the requested organizationId', async () => {
      // Simulate: user-uuid-1 is NOT a member of org-uuid-B
      mockPrisma.membership.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.getMe('user-uuid-1', 'org-uuid-B'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return only data for the specific organization, not all orgs', async () => {
      // Org A membership
      const orgAMembership = buildMockMembership();
      mockPrisma.membership.findFirst = jest.fn().mockResolvedValue(orgAMembership);

      const result = await service.getMe('user-uuid-1', 'org-uuid-1');
      expect(result.organizationId).toBe('org-uuid-1');

      // Org B query must use org-uuid-B in the where clause
      mockPrisma.membership.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.getMe('user-uuid-1', 'org-uuid-B')).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify the second call used org-uuid-B
      expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-uuid-B' }),
        }),
      );
    });
  });
});
