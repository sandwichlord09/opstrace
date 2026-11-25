import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule is marked @Global so PrismaService is available to every module
 * without explicitly importing it. The alternative — reimporting per module —
 * would create multiple connection pools and inconsistent tenant contexts.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
