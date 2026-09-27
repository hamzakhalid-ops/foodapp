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
} from '@nestjs/common';
import {
  type AddStaffRequest,
  addStaffRequestSchema,
  type StaffMember,
  type UpdateStaffRequest,
  updateStaffRequestSchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantOwnerOnly,
} from '../restaurants/restaurant-access';
import { RestaurantStaffService } from './restaurant-staff.service';

/** /api/v1/restaurant/staff — API_SPEC §57 (owner only: staff.read / staff.manage). */
@Controller('restaurant/staff')
@Roles('RESTAURANT_OWNER')
@RestaurantOwnerOnly()
export class RestaurantStaffController {
  constructor(private readonly staff: RestaurantStaffService) {}

  @Get()
  list(@CurrentRestaurant() access: RestaurantAccess): Promise<StaffMember[]> {
    return this.staff.list(access.restaurantId);
  }

  @Post()
  add(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(addStaffRequestSchema)) body: AddStaffRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<StaffMember> {
    return this.staff.addOperator(access.restaurantId, body.email, auth.userId, meta);
  }

  @Get(':staffId')
  get(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('staffId', ParseUUIDPipe) staffId: string,
  ): Promise<StaffMember> {
    return this.staff.get(access.restaurantId, staffId);
  }

  @Patch(':staffId')
  update(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Body(new ZodValidationPipe(updateStaffRequestSchema)) body: UpdateStaffRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<StaffMember> {
    return this.staff.setStatus(access.restaurantId, staffId, body.status, auth.userId, meta);
  }

  @Delete(':staffId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<void> {
    await this.staff.setStatus(access.restaurantId, staffId, 'INACTIVE', auth.userId, meta);
  }
}
