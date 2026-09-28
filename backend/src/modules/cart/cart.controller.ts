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
  type AddCartItemRequest,
  addCartItemRequestSchema,
  type Cart,
  type UpdateCartItemRequest,
  updateCartItemRequestSchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { CartService } from './cart.service';

/** /api/v1/cart — API_SPEC §32–36. Every response is freshly recalculated by the backend. */
@Controller('cart')
@Roles('CUSTOMER')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentAuth() auth: AuthContext): Promise<Cart> {
    return this.cart.get(auth.userId);
  }

  @Post('items')
  add(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(addCartItemRequestSchema)) body: AddCartItemRequest,
  ): Promise<Cart> {
    return this.cart.addItem(auth.userId, body);
  }

  @Patch('items/:cartItemId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
    @Body(new ZodValidationPipe(updateCartItemRequestSchema)) body: UpdateCartItemRequest,
  ): Promise<Cart> {
    return this.cart.updateQuantity(auth.userId, cartItemId, body.quantity);
  }

  @Delete('items/:cartItemId')
  remove(
    @CurrentAuth() auth: AuthContext,
    @Param('cartItemId', ParseUUIDPipe) cartItemId: string,
  ): Promise<Cart> {
    return this.cart.removeItem(auth.userId, cartItemId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentAuth() auth: AuthContext): Promise<void> {
    return this.cart.clear(auth.userId);
  }

  @Post('recalculate')
  @HttpCode(HttpStatus.OK)
  recalculate(@CurrentAuth() auth: AuthContext): Promise<Cart> {
    return this.cart.get(auth.userId);
  }
}
