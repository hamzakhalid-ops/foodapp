import { Injectable } from '@nestjs/common';
import { type CurrentUser } from '@quickbite/validation';
import { type Prisma, type Role, UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { type Identifier } from './identity-normalization';

export const userWithRoles = { roles: { select: { role: true } } } as const;
export type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userWithRoles }>;

/** Users module — identity records and role assignment (DATABASE.md §4–5). */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({ where: { id }, include: userWithRoles });
  }

  /** Creates an identity with its initial role (AUTH_AUTHORIZATION §7). */
  createUser(
    tx: Prisma.TransactionClient,
    data: { email: string; phone: string; passwordHash: string; role: Role },
  ): Promise<UserWithRoles> {
    return tx.user.create({
      data: {
        email: data.email,
        phone: data.phone,
        passwordHash: data.passwordHash,
        status: UserStatus.PENDING_VERIFICATION,
        roles: { create: { role: data.role } },
      },
      include: userWithRoles,
    });
  }

  findByIdentifier(identifier: Identifier): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where:
        identifier.kind === 'email' ? { email: identifier.value } : { phone: identifier.value },
      include: userWithRoles,
    });
  }
}

/** API_SPEC §25 representation. Never includes password hashes or verification secrets. */
export function toCurrentUser(user: UserWithRoles): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    roles: user.roles.map((entry) => entry.role),
    status: user.status,
  };
}
