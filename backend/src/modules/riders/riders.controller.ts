import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AdminRiderListQuery,
  adminRiderListQuerySchema,
  type AdminRiderUpdateRequest,
  adminRiderUpdateRequestSchema,
  reasonRequestSchema,
  type RiderAvailability,
  type RiderAvailabilityRequest,
  riderAvailabilityRequestSchema,
  type RiderDocument,
  riderDocumentTypeSchema,
  type RiderLocationRequest,
  riderLocationRequestSchema,
  type RiderOnboarding,
  type RiderProfile,
  type UpdateRiderProfileRequest,
  updateRiderProfileRequestSchema,
} from '@quickbite/validation';
import { AdminOnly, type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { offsetPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { type UploadedFile as StoredFile } from '../../infrastructure/storage/file-validation';
import { type AdminRiderDetail, RiderReviewService } from './rider-review.service';
import { RidersService } from './riders.service';

const UPLOAD_LIMITS = { limits: { fileSize: 25 * 1024 * 1024, files: 1 } };

/** /api/v1/rider — API_SPEC §64–69 (rider only; the rider is always the caller). */
@Controller('rider')
@Roles('RIDER')
export class RidersController {
  constructor(private readonly riders: RidersService) {}

  @Get('profile')
  profile(@CurrentAuth() auth: AuthContext): Promise<RiderProfile> {
    return this.riders.getProfile(auth.userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateRiderProfileRequestSchema)) body: UpdateRiderProfileRequest,
  ): Promise<RiderProfile> {
    return this.riders.updateProfile(auth.userId, body);
  }

  @Get('onboarding')
  onboarding(@CurrentAuth() auth: AuthContext): Promise<RiderOnboarding> {
    return this.riders.getOnboarding(auth.userId);
  }

  @Patch('onboarding')
  updateOnboarding(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateRiderProfileRequestSchema)) body: UpdateRiderProfileRequest,
  ): Promise<RiderOnboarding> {
    return this.riders.updateOnboarding(auth.userId, body);
  }

  @Post('onboarding/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentAuth() auth: AuthContext): Promise<RiderOnboarding> {
    return this.riders.submit(auth.userId);
  }

  @Get('documents')
  documents(@CurrentAuth() auth: AuthContext): Promise<RiderDocument[]> {
    return this.riders.listDocuments(auth.userId);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMITS))
  upload(
    @CurrentAuth() auth: AuthContext,
    @Body('documentType', new ZodValidationPipe(riderDocumentTypeSchema)) documentType: string,
    @UploadedFile() file: StoredFile | undefined,
  ): Promise<RiderDocument> {
    return this.riders.uploadDocument(auth.userId, documentType, file);
  }

  @Patch('documents/:documentId')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMITS))
  replace(
    @CurrentAuth() auth: AuthContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: StoredFile | undefined,
  ): Promise<RiderDocument> {
    return this.riders.replaceDocument(auth.userId, documentId, file);
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    return this.riders.deleteDocument(auth.userId, documentId);
  }

  @Get('availability')
  availability(@CurrentAuth() auth: AuthContext): Promise<RiderAvailability> {
    return this.riders.getAvailability(auth.userId);
  }

  @Post('availability/online')
  @HttpCode(HttpStatus.OK)
  online(@CurrentAuth() auth: AuthContext): Promise<RiderAvailability> {
    return this.riders.goOnline(auth.userId);
  }

  @Post('availability/offline')
  @HttpCode(HttpStatus.OK)
  offline(@CurrentAuth() auth: AuthContext): Promise<RiderAvailability> {
    return this.riders.goOffline(auth.userId);
  }

  @Post('availability')
  @HttpCode(HttpStatus.OK)
  setAvailability(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(riderAvailabilityRequestSchema)) body: RiderAvailabilityRequest,
  ): Promise<RiderAvailability> {
    return this.riders.setAvailable(auth.userId, body.available);
  }

  @Post('location')
  @HttpCode(HttpStatus.NO_CONTENT)
  location(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(riderLocationRequestSchema)) body: RiderLocationRequest,
  ): Promise<void> {
    return this.riders.updateLocation(auth.userId, body);
  }
}

/** /api/v1/admin/riders — API_SPEC §98–99 */
@Controller('admin/riders')
@AdminOnly()
export class AdminRidersController {
  constructor(private readonly review: RiderReviewService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminRiderListQuerySchema)) query: AdminRiderListQuery,
  ): Promise<ApiPage<RiderProfile>> {
    const { rows, total } = await this.review.list(query);
    return offsetPage(rows, total, query.page, query.pageSize);
  }

  @Get(':riderId')
  detail(@Param('riderId', ParseUUIDPipe) riderId: string): Promise<AdminRiderDetail> {
    return this.review.detail(riderId);
  }

  @Patch(':riderId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('riderId', ParseUUIDPipe) riderId: string,
    @Body(new ZodValidationPipe(adminRiderUpdateRequestSchema)) body: AdminRiderUpdateRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRiderDetail> {
    return this.review.update(riderId, body, auth.userId, meta);
  }

  @Post(':riderId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('riderId', ParseUUIDPipe) riderId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRiderDetail> {
    return this.review.act(riderId, 'APPROVE', null, auth.userId, meta);
  }

  @Post(':riderId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('riderId', ParseUUIDPipe) riderId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRiderDetail> {
    return this.review.act(riderId, 'REJECT', body.reason, auth.userId, meta);
  }

  @Post(':riderId/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @CurrentAuth() auth: AuthContext,
    @Param('riderId', ParseUUIDPipe) riderId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRiderDetail> {
    return this.review.act(riderId, 'SUSPEND', body.reason, auth.userId, meta);
  }

  @Post(':riderId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentAuth() auth: AuthContext,
    @Param('riderId', ParseUUIDPipe) riderId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminRiderDetail> {
    return this.review.act(riderId, 'RESTORE', body.reason, auth.userId, meta);
  }
}
