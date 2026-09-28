import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  type Delivery,
  type DispatchOffer,
  type DispatchSettings,
  type UpdateDispatchSettingsRequest,
  updateDispatchSettingsRequestSchema,
  type RejectOfferRequest,
  rejectOfferRequestSchema,
} from '@quickbite/validation';
import {
  AdminOnly,
  type AuthContext,
  CurrentAuth,
  RecentMfa,
  Roles,
} from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { DispatchSettingsService } from './dispatch-settings.service';
import { DispatchService } from './dispatch.service';

/** Rider dispatch offers — API_SPEC §70. Riders never assign themselves (§71). */
@Controller('rider/delivery-offers')
@Roles('RIDER')
export class DispatchOffersController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<DispatchOffer[]> {
    return this.dispatch.listOffers(auth.userId);
  }

  @Get(':offerId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ): Promise<DispatchOffer> {
    return this.dispatch.getOffer(auth.userId, offerId);
  }

  @Post(':offerId/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentAuth() auth: AuthContext,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ): Promise<Delivery> {
    return this.dispatch.accept(auth.userId, offerId);
  }

  @Post(':offerId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body(new ZodValidationPipe(rejectOfferRequestSchema)) body: RejectOfferRequest,
  ): Promise<DispatchOffer> {
    return this.dispatch.reject(auth.userId, offerId, body.reasonCode);
  }
}

/** Dispatch configuration (API_SPEC §107). Changing it is sensitive configuration: SUPER_ADMIN + step-up. */
@Controller('admin/dispatch-settings')
@AdminOnly()
export class AdminDispatchSettingsController {
  constructor(private readonly settings: DispatchSettingsService) {}

  @Get()
  get(): Promise<DispatchSettings> {
    return this.settings.get();
  }

  @Put()
  @Roles('SUPER_ADMIN')
  @RecentMfa()
  update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateDispatchSettingsRequestSchema))
    body: UpdateDispatchSettingsRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DispatchSettings> {
    return this.settings.update(body, auth.userId, meta);
  }
}
