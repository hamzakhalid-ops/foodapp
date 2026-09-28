import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IDEMPOTENCY_KEY_HEADER } from '@quickbite/types';
import {
  type CheckoutPreview,
  type CheckoutPreviewRequest,
  checkoutPreviewRequestSchema,
  type CreateOrderRequest,
  createOrderRequestSchema,
  type Order,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { CheckoutService } from './checkout.service';

/** API_SPEC §37–38 */
@Controller()
@Roles('CUSTOMER')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('checkout/preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(checkoutPreviewRequestSchema)) body: CheckoutPreviewRequest,
  ): Promise<CheckoutPreview> {
    return this.checkout.preview(auth.userId, body);
  }

  @Post('orders')
  @Idempotent()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createOrderRequestSchema)) body: CreateOrderRequest,
    @Headers(IDEMPOTENCY_KEY_HEADER.toLowerCase()) idempotencyKey: string | undefined,
  ): Promise<Order> {
    return this.checkout.placeOrder(auth.userId, body, idempotencyKey ?? null);
  }
}
