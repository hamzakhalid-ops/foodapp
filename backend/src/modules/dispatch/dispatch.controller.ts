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
  type Delivery,
  type DispatchOffer,
  type RejectOfferRequest,
  rejectOfferRequestSchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
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
