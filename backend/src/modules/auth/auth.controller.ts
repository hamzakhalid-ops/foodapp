import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type AuthTokens,
  type CurrentUser,
  type ForgotPasswordRequest,
  forgotPasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
  type RefreshRequest,
  refreshRequestSchema,
  type RegisterRequest,
  registerRequestSchema,
  type RegisterResponse,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
  type VerifyEmailRequest,
  verifyEmailRequestSchema,
  type VerifyPhoneRequest,
  verifyPhoneRequestSchema,
} from '@quickbite/validation';
import {
  AllowUnverified,
  type AuthContext,
  CurrentAuth,
  Public,
} from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AppConfigService } from '../../config/app-config.service';
import { parseIdentifier } from '../users/identity-normalization';
import { AuthService } from './auth.service';

/**
 * /api/v1/auth — docs/api/API_SPEC.md §16–24.
 *
 * Rate limits (AUTH_AUTHORIZATION §17–18) are applied per client IP and, for identifier-based
 * endpoints, per normalized identifier, before any expensive or state-changing work.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly rateLimit: RateLimitService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RegisterResponse> {
    await this.rateLimit.consume('register:ip', ip(meta), this.config.get('RATE_LIMIT_REGISTER'));
    return this.auth.register(body, meta);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<LoginResponse> {
    const rule = this.config.get('RATE_LIMIT_LOGIN');
    await this.rateLimit.consume('login:ip', ip(meta), rule);
    await this.rateLimit.consume('login:identifier', identifierKey(body.identifier), rule);
    return this.auth.login(body.identifier, body.password, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AuthTokens> {
    await this.rateLimit.consume('refresh:ip', ip(meta), this.config.get('RATE_LIMIT_REFRESH'));
    return this.auth.refresh(body.refreshToken, meta);
  }

  @AllowUnverified()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentAuth() auth: AuthContext, @ReqMeta() meta: RequestMeta): Promise<void> {
    await this.auth.logout(auth.userId, auth.sessionId, meta);
  }

  @AllowUnverified()
  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  async verifyPhone(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(verifyPhoneRequestSchema)) body: VerifyPhoneRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<CurrentUser> {
    const rule = this.config.get('RATE_LIMIT_OTP_VERIFY');
    await this.rateLimit.consume('otp-verify:user', auth.userId, rule);
    await this.rateLimit.consume('otp-verify:ip', ip(meta), rule);
    return this.auth.verifyPhone(auth.userId, body.code, meta);
  }

  @AllowUnverified()
  @Post('verify-phone/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendPhoneVerification(
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ): Promise<null> {
    const rule = this.config.get('RATE_LIMIT_OTP_SEND');
    await this.rateLimit.consume('otp-send:user', auth.userId, rule);
    await this.rateLimit.consume('otp-send:ip', ip(meta), rule);
    await this.auth.resendPhoneVerification(auth.userId);
    return null;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.rateLimit.consume(
      'email-verify:ip',
      ip(meta),
      this.config.get('RATE_LIMIT_EMAIL_VERIFY'),
    );
    await this.auth.verifyEmail(body.token, meta);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<null> {
    const rule = this.config.get('RATE_LIMIT_PASSWORD_RESET');
    await this.rateLimit.consume('forgot:ip', ip(meta), rule);
    await this.rateLimit.consume('forgot:identifier', identifierKey(body.identifier), rule);
    await this.auth.forgotPassword(body.identifier, meta);
    return null;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.rateLimit.consume(
      'reset:ip',
      ip(meta),
      this.config.get('RATE_LIMIT_PASSWORD_RESET'),
    );
    await this.auth.resetPassword(body.token, body.newPassword, meta);
  }
}

function ip(meta: RequestMeta): string {
  return meta.ipAddress ?? 'unknown';
}

/** Rate-limit key that treats formatting variants of the same identifier as one subject. */
function identifierKey(raw: string): string {
  const parsed = parseIdentifier(raw);
  return parsed ? `${parsed.kind}:${parsed.value}` : `raw:${raw.trim().toLowerCase()}`;
}
