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
  type Address,
  type CreateAddressRequest,
  createAddressRequestSchema,
  type CustomerProfile,
  type UpdateAddressRequest,
  updateAddressRequestSchema,
  type UpdateCustomerProfileRequest,
  updateCustomerProfileRequestSchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { CustomersService } from './customers.service';

/** /api/v1/customer — API_SPEC §26–27. A customer can only access their own data. */
@Controller('customer')
@Roles('CUSTOMER')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('profile')
  getProfile(@CurrentAuth() auth: AuthContext): Promise<CustomerProfile> {
    return this.customers.getProfile(auth.userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateCustomerProfileRequestSchema))
    body: UpdateCustomerProfileRequest,
  ): Promise<CustomerProfile> {
    return this.customers.updateProfile(auth.userId, body);
  }

  @Get('addresses')
  listAddresses(@CurrentAuth() auth: AuthContext): Promise<Address[]> {
    return this.customers.listAddresses(auth.userId);
  }

  @Post('addresses')
  createAddress(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createAddressRequestSchema)) body: CreateAddressRequest,
  ): Promise<Address> {
    return this.customers.createAddress(auth.userId, body);
  }

  @Patch('addresses/:addressId')
  updateAddress(
    @CurrentAuth() auth: AuthContext,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body(new ZodValidationPipe(updateAddressRequestSchema)) body: UpdateAddressRequest,
  ): Promise<Address> {
    return this.customers.updateAddress(auth.userId, addressId, body);
  }

  @Delete('addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAddress(
    @CurrentAuth() auth: AuthContext,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<void> {
    await this.customers.deleteAddress(auth.userId, addressId);
  }

  @Post('addresses/:addressId/default')
  @HttpCode(HttpStatus.OK)
  setDefault(
    @CurrentAuth() auth: AuthContext,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<Address> {
    return this.customers.setDefaultAddress(auth.userId, addressId);
  }
}
