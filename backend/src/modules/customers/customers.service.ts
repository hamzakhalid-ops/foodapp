import { Injectable } from '@nestjs/common';
import { type Prisma } from '../../generated/prisma/client';

/** Customers module — customer profile records (DATABASE.md §6). */
@Injectable()
export class CustomersService {
  /** Creates the customer profile at registration (AUTH_AUTHORIZATION §7, step 8). */
  async createProfile(
    tx: Prisma.TransactionClient,
    userId: string,
    profile: { firstName: string; lastName: string },
  ): Promise<void> {
    await tx.customerProfile.create({
      data: { userId, firstName: profile.firstName, lastName: profile.lastName },
    });
  }
}
