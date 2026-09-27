import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigService } from '../../config/app-config.service';
import { CustomersModule } from '../customers/customers.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RidersModule } from '../riders/riders.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { SessionAuthenticator } from './session-authenticator';
import { AuthService } from './auth.service';
import { ChallengeService } from './challenge.service';
import { LogVerificationSender } from './delivery/log-verification-sender';
import { VERIFICATION_SENDER } from './delivery/verification-sender';
import { PasswordService } from './password.service';
import { RestaurantAuthController } from './restaurant-auth.controller';
import { RiderAuthController } from './rider-auth.controller';
import { RolesGuard } from './roles.guard';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Auth module — Registration, login/logout, sessions and refresh tokens, verification, password
 * management, account status checks (ARCHITECTURE §5, AUTH_AUTHORIZATION).
 *
 * Owns tables: user_sessions, refresh_tokens, verification_challenges (DATABASE.md §5.1).
 * Implemented in slice: 1 — Authentication (docs/IMPLEMENTATION_PLAN.md).
 *
 * Registers the global AuthGuard (authentication required by default) and RolesGuard.
 */
@Module({
  imports: [UsersModule, CustomersModule, RestaurantsModule, RidersModule],
  controllers: [AuthController, RestaurantAuthController, RiderAuthController],
  providers: [
    SessionAuthenticator,
    AuthService,
    PasswordService,
    TokenService,
    SessionService,
    ChallengeService,
    {
      provide: VERIFICATION_SENDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const appEnv = config.get('APP_ENV');
        if (appEnv === 'staging' || appEnv === 'production') {
          throw new Error('No verification delivery provider is configured for this environment');
        }
        return new LogVerificationSender();
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, SessionService, SessionAuthenticator],
})
export class AuthModule {}
