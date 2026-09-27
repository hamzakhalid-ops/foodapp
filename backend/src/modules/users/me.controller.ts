import { Controller, Get, HttpStatus } from '@nestjs/common';
import { type CurrentUser } from '@quickbite/validation';
import { AllowUnverified, type AuthContext, CurrentAuth } from '../../common/auth/auth.decorators';
import { ApiException } from '../../common/http/api.exception';
import { toCurrentUser, UsersService } from './users.service';

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  /** GET /api/v1/me — API_SPEC §25. */
  @Get()
  @AllowUnverified()
  async me(@CurrentAuth() auth: AuthContext): Promise<CurrentUser> {
    const user = await this.users.findById(auth.userId);
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTH_TOKEN_INVALID',
        'Authentication is required.',
      );
    }
    return toCurrentUser(user);
  }
}
