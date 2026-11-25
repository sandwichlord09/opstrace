import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TenantContext } from '../prisma/tenant-context';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

/**
 * AuthModule wires together all authentication dependencies.
 *
 * JwtModule is configured async so ConfigService can inject
 * the JWT_SECRET from the environment file at runtime.
 *
 * TenantContext and JwtAuthGuard are provided here because they depend on
 * JwtService; other modules that need JwtAuthGuard should import AuthModule.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRATION', '7d'),
        },
      }),
    }),
  ],
  providers: [AuthService, TenantContext, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, TenantContext, JwtAuthGuard],
})
export class AuthModule {}
