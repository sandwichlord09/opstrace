import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MembershipStatus, RoleName, UserContext } from '@opstrace/shared-types';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../common/constants/permissions.constant';

// ─── Mock AuthService ──────────────────────────────────────────────────────────

function buildMockAuthService() {
  return {
    register: jest.fn().mockResolvedValue({
      accessToken: 'mock.jwt.token',
      userId: 'user-uuid-1',
      email: 'admin@acme.com',
      organizationId: 'org-uuid-1',
      role: RoleName.ORG_ADMIN,
    }),
    login: jest.fn().mockResolvedValue({
      accessToken: 'mock.jwt.token',
      userId: 'user-uuid-1',
      email: 'admin@acme.com',
      organizationId: 'org-uuid-1',
      role: RoleName.ORG_ADMIN,
    }),
    getMe: jest.fn().mockResolvedValue({
      userId: 'user-uuid-1',
      email: 'admin@acme.com',
      firstName: 'Jane',
      lastName: 'Doe',
      organizationId: 'org-uuid-1',
      organizationName: 'Acme Corp',
      role: RoleName.ORG_ADMIN,
      permissions: ROLE_PERMISSIONS[RoleName.ORG_ADMIN],
    }),
  };
}

/**
 * Builds a mock JwtAuthGuard that injects a specified UserContext into req.user,
 * simulating a successfully authenticated user without a real JWT or database.
 */
function buildMockJwtGuard(userContext: UserContext) {
  return {
    canActivate: jest.fn().mockImplementation((context) => {
      const req = context.switchToHttp().getRequest();
      req.user = userContext;
      return true;
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: AuthController (HTTP layer + RBAC enforcement)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AuthController — HTTP Integration', () => {
  let app: INestApplication;
  let mockAuthService: ReturnType<typeof buildMockAuthService>;

  async function buildApp(userContext?: UserContext) {
    mockAuthService = buildMockAuthService();

    const builder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    });

    // Override JwtAuthGuard so NestJS doesn't require JwtService/PrismaService in controller tests
    if (userContext) {
      builder.overrideGuard(JwtAuthGuard).useValue(buildMockJwtGuard(userContext));
    } else {
      builder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => false });
    }

    const module: TestingModule = await builder.compile();
    app = module.createNestApplication();
    await app.init();
    return app;
  }

  afterEach(() => app?.close());

  // ─── POST /api/v1/auth/register ───────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('201: returns token and user metadata on valid input', async () => {
      await buildApp();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'admin@acme.com',
          password: 'password123',
          firstName: 'Jane',
          lastName: 'Doe',
          organizationName: 'Acme Corp',
        });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.organizationId).toBe('org-uuid-1');
      expect(res.body.role).toBe(RoleName.ORG_ADMIN);
    });

    it('400: rejects missing required fields (Zod validation)', async () => {
      await buildApp();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: '123' }); // bad email, short password, missing names

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
    });

    it('400: rejects password shorter than 8 characters', async () => {
      await buildApp();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'admin@acme.com',
          password: '1234567', // 7 chars
          firstName: 'Jane',
          lastName: 'Doe',
          organizationName: 'Acme',
        });

      expect(res.status).toBe(400);
    });

    it('409: returns ConflictException when email is already registered', async () => {
      await buildApp();
      const { ConflictException } = await import('@nestjs/common');
      mockAuthService.register.mockRejectedValueOnce(
        new ConflictException('Email already registered'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'existing@acme.com',
          password: 'password123',
          firstName: 'Jane',
          lastName: 'Doe',
          organizationName: 'Acme Corp',
        });

      expect(res.status).toBe(409);
    });
  });

  // ─── POST /api/v1/auth/login ──────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('200: returns token on valid credentials', async () => {
      await buildApp();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.organizationId).toBe('org-uuid-1');
    });

    it('401: rejects invalid credentials', async () => {
      await buildApp();
      const { UnauthorizedException } = await import('@nestjs/common');
      mockAuthService.login.mockRejectedValueOnce(
        new UnauthorizedException('Invalid email or password'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@acme.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
    });

    it('400: rejects missing password field', async () => {
      await buildApp();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@acme.com' }); // no password

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /api/v1/auth/me ─────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('200: returns user profile when authenticated with valid Admin context', async () => {
      const adminContext: UserContext = {
        userId: 'user-uuid-1',
        email: 'admin@acme.com',
        organizationId: 'org-uuid-1',
        roles: [RoleName.ORG_ADMIN],
        permissions: ROLE_PERMISSIONS[RoleName.ORG_ADMIN] as string[],
      };
      await buildApp(adminContext);

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer mock.jwt.token');

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('admin@acme.com');
      expect(res.body.organizationId).toBe('org-uuid-1');
      expect(res.body.permissions).toContain('users:manage');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: RBAC Permission Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe('RBAC Enforcement', () => {
  /**
   * These tests directly exercise the PermissionsGuard by checking that the
   * Employee and Auditor roles do NOT have admin-only permissions.
   *
   * RATIONALE: Testing the guard against real mock HTTP routes is integration-heavy.
   * Instead, we verify that ROLE_PERMISSIONS is defined correctly (which the guard
   * reads from req.user.permissions). The guard itself is unit-tested by calling
   * canActivate() directly below.
   */

  describe('Permission set completeness', () => {
    it('ORG_ADMIN has users:manage permission', () => {
      expect(ROLE_PERMISSIONS[RoleName.ORG_ADMIN]).toContain(PERMISSIONS.USERS_MANAGE);
    });

    it('WAREHOUSE_EMPLOYEE does NOT have users:manage permission', () => {
      expect(ROLE_PERMISSIONS[RoleName.WAREHOUSE_EMPLOYEE]).not.toContain(
        PERMISSIONS.USERS_MANAGE,
      );
    });

    it('AUDITOR does NOT have exception:resolve permission', () => {
      expect(ROLE_PERMISSIONS[RoleName.AUDITOR]).not.toContain(PERMISSIONS.EXCEPTION_RESOLVE);
    });

    it('AUDITOR does NOT have po:create permission', () => {
      expect(ROLE_PERMISSIONS[RoleName.AUDITOR]).not.toContain(PERMISSIONS.PO_CREATE);
    });

    it('OPS_MANAGER has exception:resolve permission', () => {
      expect(ROLE_PERMISSIONS[RoleName.OPS_MANAGER]).toContain(PERMISSIONS.EXCEPTION_RESOLVE);
    });

    it('WAREHOUSE_EMPLOYEE has receipt:submit but NOT exception:resolve', () => {
      const perms = ROLE_PERMISSIONS[RoleName.WAREHOUSE_EMPLOYEE];
      expect(perms).toContain(PERMISSIONS.RECEIPT_SUBMIT);
      expect(perms).not.toContain(PERMISSIONS.EXCEPTION_RESOLVE);
    });

    it('WAREHOUSE_SUPERVISOR can review inspections but cannot resolve exceptions', () => {
      const perms = ROLE_PERMISSIONS[RoleName.WAREHOUSE_SUPERVISOR];
      expect(perms).toContain(PERMISSIONS.INSPECTION_REVIEW);
      expect(perms).not.toContain(PERMISSIONS.EXCEPTION_RESOLVE);
    });
  });

  // ─── PermissionsGuard direct unit tests ───────────────────────────────────

  describe('PermissionsGuard.canActivate()', () => {
    const { PermissionsGuard } = require('../common/guards/permissions.guard');
    const { Reflector } = require('@nestjs/core');
    const { ForbiddenException } = require('@nestjs/common');
    const { PERMISSIONS_KEY } = require('../common/decorators/require-permissions.decorator');

    function buildMockExecutionContext(
      permissions: string[],
      requiredPerms: string[],
    ) {
      const reflector = new Reflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) =>
          key === PERMISSIONS_KEY ? requiredPerms : undefined,
        );

      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              userId: 'u1',
              email: 'e@test.com',
              organizationId: 'org1',
              roles: [],
              permissions,
            } as UserContext,
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      return { guard: new PermissionsGuard(reflector), ctx };
    }

    it('allows access when user has all required permissions', () => {
      const { guard, ctx } = buildMockExecutionContext(
        [PERMISSIONS.EXCEPTION_RESOLVE, PERMISSIONS.EXCEPTION_VIEW],
        [PERMISSIONS.EXCEPTION_RESOLVE],
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws ForbiddenException (403) when Employee lacks Admin permission', () => {
      const employeePerms = ROLE_PERMISSIONS[RoleName.WAREHOUSE_EMPLOYEE] as string[];
      const { guard, ctx } = buildMockExecutionContext(
        employeePerms,
        [PERMISSIONS.USERS_MANAGE], // Admin-only
      );
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException (403) when Auditor tries exception:resolve', () => {
      const auditorPerms = ROLE_PERMISSIONS[RoleName.AUDITOR] as string[];
      const { guard, ctx } = buildMockExecutionContext(auditorPerms, [
        PERMISSIONS.EXCEPTION_RESOLVE,
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows access when no @RequirePermissions decorator is present', () => {
      const { guard, ctx } = buildMockExecutionContext([], []); // no required perms
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  // ─── Cross-tenant isolation guard test ────────────────────────────────────

  describe('Cross-tenant data isolation (JwtAuthGuard)', () => {
    /**
     * Verifies that the guard rejects tokens whose organizationId doesn't match
     * an ACTIVE membership row in the database — the core multi-tenant safeguard.
     *
     * Scenario: User authenticated under Org A presents a valid JWT but their
     * account was just suspended in Org A's admin panel. The guard must reject
     * the request even though the JWT signature is still valid.
     */
    it('throws UnauthorizedException when membership is not ACTIVE (suspended user)', async () => {
      const { JwtAuthGuard: Guard } = require('../common/guards/jwt-auth.guard');
      const { UnauthorizedException: Unauth } = require('@nestjs/common');

      const mockJwtSvc = {
        verify: jest.fn().mockReturnValue({
          sub: 'user-uuid-1',
          email: 'user@orgA.com',
          organizationId: 'org-A',
        }),
      };

      // DB returns null — simulates suspended membership OR a different org
      const mockPrismaSvc = {
        membership: { findFirst: jest.fn().mockResolvedValue(null) },
      };

      const mockTenantCtx = { run: jest.fn() };

      const guard = new Guard(mockJwtSvc, mockPrismaSvc, mockTenantCtx);

      const mockCtx = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer valid.signed.jwt' },
          }),
        }),
      };

      await expect(guard.canActivate(mockCtx)).rejects.toThrow(Unauth);
      expect(mockPrismaSvc.membership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-A', status: MembershipStatus.ACTIVE }),
        }),
      );
    });
  });
});
