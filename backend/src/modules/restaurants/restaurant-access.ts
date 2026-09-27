import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type RequestWithAuth } from '../../common/auth/auth.decorators';
import { forbidden, notFound } from '../../common/http/errors';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface RestaurantAccess {
  restaurantId: string;
  staffId: string;
  staffRole: 'OWNER' | 'OPERATOR';
}

const OWNER_ONLY_KEY = 'quickbite:restaurantOwnerOnly';

type RequestWithRestaurant = RequestWithAuth & { restaurantAccess?: RestaurantAccess };

/**
 * Restaurant tenant isolation (AUTH_AUTHORIZATION §49–50): resolves the caller's ACTIVE
 * membership from `restaurant_staff` on every request. Routes under /restaurant act on that
 * restaurant only; there is no client-supplied restaurant id to tamper with.
 */
@Injectable()
export class RestaurantAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithRestaurant>();
    const userId = request.auth?.userId;
    if (!userId) throw forbidden();

    const membership = await this.prisma.restaurantStaff.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, restaurantId: true, role: true },
    });
    if (!membership)
      throw notFound('RESTAURANT_NOT_FOUND', 'No restaurant is linked to this account.');

    const ownerOnly = this.reflector.getAllAndOverride<boolean>(OWNER_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (ownerOnly && membership.role !== 'OWNER') {
      throw forbidden(
        'AUTHZ_INSUFFICIENT_PERMISSION',
        'Only the restaurant owner can perform this action.',
      );
    }

    request.restaurantAccess = {
      restaurantId: membership.restaurantId,
      staffId: membership.id,
      staffRole: membership.role,
    };
    return true;
  }
}

/** Requires an active restaurant membership (owner or operator). */
export const RestaurantMember = () => applyDecorators(UseGuards(RestaurantAccessGuard));

/** Requires the restaurant OWNER membership (AUTH_AUTHORIZATION §42–43, §50). */
export const RestaurantOwnerOnly = () =>
  applyDecorators(SetMetadata(OWNER_ONLY_KEY, true), UseGuards(RestaurantAccessGuard));

export const CurrentRestaurant = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const access = context.switchToHttp().getRequest<RequestWithRestaurant>().restaurantAccess;
    if (!access)
      throw new Error('CurrentRestaurant used without RestaurantMember/RestaurantOwnerOnly');
    return access;
  },
);
