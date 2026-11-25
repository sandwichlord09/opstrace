import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TenantContext } from './tenant-context';
import { TenantContextInterceptor } from './tenant-context.interceptor';

describe('TenantContextInterceptor', () => {
  it('binds request.user into TenantContext for downstream async handlers', async () => {
    const tenantContext = new TenantContext();
    const interceptor = new TenantContextInterceptor(tenantContext);

    const user = {
      userId: 'user-1',
      organizationId: 'org-1',
      email: 'admin@northstar.ph',
      roles: ['ORG_ADMIN'],
      permissions: ['warehouses:view'],
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;

    const mockNext: CallHandler = {
      handle: () => {
        // Simulates a service method calling tenantContext.getOrFail()
        const orgId = tenantContext.getOrganizationId();
        return of({ orgId });
      },
    };

    const result = await lastValueFrom(
      interceptor.intercept(mockContext, mockNext),
    );
    expect(result).toEqual({ orgId: 'org-1' });
    // Outside the request, store must remain clean
    expect(tenantContext.get()).toBeUndefined();
  });
});
