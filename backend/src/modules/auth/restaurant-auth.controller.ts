import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type RegisterResponse,
  type RestaurantRegisterRequest,
  restaurantRegisterRequestSchema,
} from '@quickbite/validation';
import { Public } from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AppConfigService } from '../../config/app-config.service';
import { Role } from '../../generated/prisma/client';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { AuthService } from './auth.service';

/**
 * POST /api/v1/restaurant/auth/register — API_SPEC §44. Creates a RESTAURANT_OWNER account that
 * begins onboarding; the restaurant operates only after admin approval (AUTH_AUTHORIZATION §121).
 */
@Controller('restaurant/auth')
export class RestaurantAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly restaurants: RestaurantsService,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(restaurantRegisterRequestSchema)) body: RestaurantRegisterRequest,
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
        role: Role.RESTAURANT_OWNER,
        createProfile: (tx, userId) =>
          this.restaurants.createOwnerProfile(tx, userId, {
            firstName: body.ownerFirstName,
            lastName: body.ownerLastName,
          }),
      },
      meta,
    );
  }
}
