import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type RegisterResponse,
  type RiderRegisterRequest,
  riderRegisterRequestSchema,
} from '@quickbite/validation';
import { Public } from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AppConfigService } from '../../config/app-config.service';
import { Role } from '../../generated/prisma/client';
import { RidersService } from '../riders/riders.service';
import { AuthService } from './auth.service';

/**
 * POST /api/v1/rider/auth/register — API_SPEC §63. Creates a RIDER account that
 * begins onboarding; the rider receives deliveries only after admin approval (DATABASE.md §32).
 */
@Controller('rider/auth')
export class RiderAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly riders: RidersService,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(riderRegisterRequestSchema)) body: RiderRegisterRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RegisterResponse> {
    await this.rateLimit.consume(
      'register:ip',
      meta.ipAddress ?? 'unknown',
      this.config.get('RATE_LIMIT_REGISTER'),
    );
    return this.auth.registerAccount(
      {
        email: body.email,
        phone: body.phone,
        password: body.password,
        role: Role.RIDER,
        createProfile: (tx, userId) =>
          this.riders.createProfile(tx, userId, {
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone,
          }),
      },
      meta,
    );
  }
}
