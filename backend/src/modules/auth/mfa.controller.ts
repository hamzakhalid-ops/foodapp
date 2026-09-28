import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type MfaCodeRequest,
  mfaCodeRequestSchema,
  type MfaSetup,
  type MfaStatus,
} from '@quickbite/validation';
import {
  AdminOnly,
  type AuthContext,
  CurrentAuth,
  MfaEnrollment,
  RecentMfa,
  Roles,
} from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { MfaService } from './mfa.service';

/** Admin TOTP enrolment and verification (AUTH_AUTHORIZATION §34–38; gap-fill endpoints). */
@Controller('auth/mfa')
@AdminOnly()
@MfaEnrollment()
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  status(@CurrentAuth() auth: AuthContext): Promise<MfaStatus> {
    return this.mfa.status(auth);
  }

  @Post('totp/setup')
  setup(@CurrentAuth() auth: AuthContext): Promise<MfaSetup> {
    return this.mfa.setup(auth);
  }

  @Post('totp/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(mfaCodeRequestSchema)) body: MfaCodeRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<MfaStatus> {
    return this.mfa.confirm(auth, body.code, meta);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(mfaCodeRequestSchema)) body: MfaCodeRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<MfaStatus> {
    return this.mfa.verify(auth, body.code, meta);
  }
}

/** Lost-authenticator recovery (AUTH_AUTHORIZATION §126: MFA changes need step-up). */
@Controller('admin/users')
export class AdminMfaController {
  constructor(private readonly mfa: MfaService) {}

  @Post(':userId/mfa/reset')
  @Roles('SUPER_ADMIN')
  @RecentMfa()
  @HttpCode(HttpStatus.NO_CONTENT)
  reset(
    @CurrentAuth() auth: AuthContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    return this.mfa.reset(userId, auth.userId, meta);
  }
}
