import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContext } from './tenant-context';

/**
 * PrismaModule is marked @Global so PrismaService and TenantContext are
 * available as singletons to every module without explicitly importing them.
 */
@Global()
@Module({
  providers: [PrismaService, TenantContext],
  exports: [PrismaService, TenantContext],
})
export class PrismaModule {}
