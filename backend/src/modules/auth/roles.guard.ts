import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Role } from '@quickbite/types';
import { type RequestWithAuth, ROLES_KEY } from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';

/**
 * Role check — the "Role" step of the authorization chain (AUTH_AUTHORIZATION §47). Resource
 * ownership, tenant and business-rule checks stay in the owning domain service (§60).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const auth = context.switchToHttp().getRequest<RequestWithAuth>().auth;
    if (!auth) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_TOKEN_INVALID',
        'Authentication is required.',
      );
    }
    if (!required.some((role) => auth.roles.includes(role))) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'AUTHZ_INSUFFICIENT_PERMISSION',
        'You do not have permission to perform this action.',
      );
    }
    return true;
  }
}
