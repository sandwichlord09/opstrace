import { DynamicModule, Module, Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { ImportsController } from './imports.controller';
import { ImportsProcessor } from './imports.processor';
import { ImportsService, PO_IMPORTS_QUEUE } from './imports.service';

@Module({})
export class ImportsModule {
  /**
   * Registers BullMQ + Redis queue when ENABLE_BULLMQ=true, or falls back to
   * synchronous in-process CSV execution when Redis is disabled (e.g., tests).
   */
  static register(): DynamicModule {
    const bullEnabled = process.env.ENABLE_BULLMQ === 'true';

    const imports: DynamicModule['imports'] = [AuthModule];
    const providers: Provider[] = [ImportsService];

    if (bullEnabled) {
      imports.push(
        BullModule.forRoot({
          connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT || 6379),
            password: process.env.REDIS_PASSWORD || undefined,
          },
        }),
        BullModule.registerQueue({
          name: PO_IMPORTS_QUEUE,
        }),
      );
      providers.push(ImportsProcessor);
    }

    return {
      module: ImportsModule,
      imports,
      controllers: [ImportsController],
      providers,
      exports: [ImportsService],
    };
  }
}
