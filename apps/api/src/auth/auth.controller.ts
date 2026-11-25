import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserSchema, LoginSchema } from '@opstrace/validation';
import { UserContext } from '@opstrace/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

/**
 * AuthController — Thin HTTP layer for authentication endpoints.
 *
 * RULE (rules.md §1): Controllers handle only routing and input/output shaping.
 * All business logic (hashing, transaction, JWT signing) lives in AuthService.
 */
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/register
   * Creates a new user, organization, all system roles, and admin membership
   * atomically in a single Prisma transaction.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(RegisterUserSchema)) body: unknown,
  ) {
    const input = body as import('@opstrace/validation').RegisterUserInput;
    return this.authService.register(input);
  }

  /**
   * POST /api/v1/auth/login
   * Verifies credentials and returns a signed JWT + organizationId + role.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: unknown) {
    const input = body as import('@opstrace/validation').LoginInput;
    return this.authService.login(input);
  }

  /**
   * GET /api/v1/auth/me
   * Returns the authenticated user's profile and current permissions.
   * Protected by JwtAuthGuard — requires a valid Bearer token.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: UserContext) {
    return this.authService.getMe(user.userId, user.organizationId);
  }
}
