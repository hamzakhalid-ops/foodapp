import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type Availability,
  type BusinessInformationRequest,
  businessInformationRequestSchema,
  type CreateRestaurantRequest,
  createRestaurantRequestSchema,
  type DeliverySettings,
  type DeliverySettingsRequest,
  deliverySettingsRequestSchema,
  documentTypeSchema,
  type Onboarding,
  type OperatingHours,
  type OperatingHoursRequest,
  operatingHoursRequestSchema,
  type PauseRequest,
  pauseRequestSchema,
  type PaymentAccountRequest,
  paymentAccountRequestSchema,
  type RestaurantAddressRequest,
  restaurantAddressRequestSchema,
  type RestaurantLocationRequest,
  restaurantLocationRequestSchema,
  type RestaurantProfile,
  type UpdateBasicInformationRequest,
  updateBasicInformationRequestSchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { type UploadedFile as StoredFile } from '../../infrastructure/storage/file-validation';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantMember,
  RestaurantOwnerOnly,
} from './restaurant-access';
import { RestaurantsService } from './restaurants.service';

const UPLOAD_LIMITS = { limits: { fileSize: 25 * 1024 * 1024, files: 1 } };

/** /api/v1/restaurant/onboarding and /application — API_SPEC §45–46 (owner only). */
@Controller('restaurant')
@Roles('RESTAURANT_OWNER')
export class RestaurantOnboardingController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Post('onboarding')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createRestaurantRequestSchema)) body: CreateRestaurantRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Onboarding> {
    return this.restaurants.createRestaurant(auth.userId, body, meta);
  }

  @Get('onboarding')
  @RestaurantOwnerOnly()
  get(@CurrentRestaurant() access: RestaurantAccess): Promise<Onboarding> {
    return this.restaurants.getOnboarding(access.restaurantId);
  }

  @Get('application')
  @RestaurantOwnerOnly()
  async application(
    @CurrentRestaurant() access: RestaurantAccess,
  ): Promise<Onboarding['application']> {
    return (await this.restaurants.getOnboarding(access.restaurantId)).application;
  }

  @Patch('onboarding/basic-information')
  @RestaurantOwnerOnly()
  basic(
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(updateBasicInformationRequestSchema))
    body: UpdateBasicInformationRequest,
  ): Promise<Onboarding> {
    return this.restaurants.updateBasicInformation(access.restaurantId, body);
  }

  @Patch('onboarding/address')
  @RestaurantOwnerOnly()
  address(
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(restaurantAddressRequestSchema)) body: RestaurantAddressRequest,
  ): Promise<Onboarding> {
    return this.restaurants.updateAddress(access.restaurantId, body);
  }

  @Patch('onboarding/location')
  @RestaurantOwnerOnly()
  location(
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(restaurantLocationRequestSchema)) body: RestaurantLocationRequest,
  ): Promise<Onboarding> {
    return this.restaurants.updateLocation(access.restaurantId, body);
  }

  @Patch('onboarding/operating-hours')
  @RestaurantOwnerOnly()
  async hours(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(operatingHoursRequestSchema)) body: OperatingHoursRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Onboarding> {
    await this.restaurants.replaceOperatingHours(access.restaurantId, body, auth.userId, meta);
    return this.restaurants.getOnboarding(access.restaurantId);
  }

  @Patch('onboarding/delivery')
  @RestaurantOwnerOnly()
  async delivery(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(deliverySettingsRequestSchema)) body: DeliverySettingsRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Onboarding> {
    await this.restaurants.updateDeliverySettings(access.restaurantId, body, auth.userId, meta);
    return this.restaurants.getOnboarding(access.restaurantId);
  }

  @Patch('onboarding/business')
  @RestaurantOwnerOnly()
  business(
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(businessInformationRequestSchema)) body: BusinessInformationRequest,
  ): Promise<Onboarding> {
    return this.restaurants.updateBusinessInformation(access.restaurantId, body);
  }

  @Post('onboarding/documents')
  @RestaurantOwnerOnly()
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMITS))
  document(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body('documentType', new ZodValidationPipe(documentTypeSchema)) documentType: string,
    @UploadedFile() file: StoredFile | undefined,
  ): Promise<Onboarding> {
    return this.restaurants.uploadDocument(access.restaurantId, documentType, file, auth.userId);
  }

  @Patch('onboarding/payment')
  @RestaurantOwnerOnly()
  payment(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(paymentAccountRequestSchema)) body: PaymentAccountRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Onboarding> {
    return this.restaurants.updatePaymentAccount(access.restaurantId, body, auth.userId, meta);
  }

  @Post('onboarding/submit')
  @HttpCode(HttpStatus.OK)
  @RestaurantOwnerOnly()
  submit(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Onboarding> {
    return this.restaurants.submit(access.restaurantId, auth.userId, meta);
  }
}

/** /api/v1/restaurant — profile, hours and availability (API_SPEC §47–49). */
@Controller('restaurant')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
export class RestaurantOperationsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get('profile')
  @RestaurantMember()
  profile(@CurrentRestaurant() access: RestaurantAccess): Promise<RestaurantProfile> {
    return this.restaurants.getProfile(access.restaurantId);
  }

  @Patch('profile')
  @RestaurantOwnerOnly()
  updateProfile(
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(updateBasicInformationRequestSchema))
    body: UpdateBasicInformationRequest,
  ): Promise<RestaurantProfile> {
    return this.restaurants.updateProfile(access.restaurantId, body);
  }

  @Get('operating-hours')
  @RestaurantMember()
  getHours(@CurrentRestaurant() access: RestaurantAccess): Promise<OperatingHours> {
    return this.restaurants.getOperatingHours(access.restaurantId);
  }

  @Put('operating-hours')
  @RestaurantOwnerOnly()
  putHours(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(operatingHoursRequestSchema)) body: OperatingHoursRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<OperatingHours> {
    return this.restaurants.replaceOperatingHours(access.restaurantId, body, auth.userId, meta);
  }

  @Get('delivery-settings')
  @RestaurantMember()
  async deliverySettings(
    @CurrentRestaurant() access: RestaurantAccess,
  ): Promise<DeliverySettings | null> {
    return (await this.restaurants.getOnboarding(access.restaurantId)).deliverySettings;
  }

  @Get('availability')
  @RestaurantMember()
  availability(@CurrentRestaurant() access: RestaurantAccess): Promise<Availability> {
    return this.restaurants.getAvailability(access.restaurantId);
  }

  @Post('availability/online')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  online(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Availability> {
    return this.restaurants.goOnline(access.restaurantId, auth.userId, meta);
  }

  @Post('availability/offline')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  offline(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Availability> {
    return this.restaurants.goOffline(access.restaurantId, auth.userId, meta);
  }

  @Post('availability/pause')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  pause(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(pauseRequestSchema)) body: PauseRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Availability> {
    return this.restaurants.pause(
      access.restaurantId,
      body.durationMinutes,
      body.reason ?? null,
      auth.userId,
      meta,
    );
  }
}
