import { Injectable } from '@nestjs/common';
import {
  type Address,
  type CreateAddressRequest,
  type CustomerProfile,
  type UpdateAddressRequest,
  type UpdateCustomerProfileRequest,
} from '@quickbite/validation';
import { notFound, validationError } from '../../common/http/errors';
import { type Address as AddressRow, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { normalizePhone } from '../users/identity-normalization';

type Tx = Prisma.TransactionClient;

/** Customers module — customer profile and saved addresses (DATABASE.md §6–7, API_SPEC §26–27). */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the customer profile at registration (AUTH_AUTHORIZATION §7, step 8). */
  async createProfile(
    tx: Tx,
    userId: string,
    profile: { firstName: string; lastName: string },
  ): Promise<void> {
    await tx.customerProfile.create({
      data: { userId, firstName: profile.firstName, lastName: profile.lastName },
    });
  }

  async getProfile(userId: string): Promise<CustomerProfile> {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!profile) throw notFound();
    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profileImageUrl: profile.profileImageUrl,
      dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString().slice(0, 10) : null,
      email: profile.user.email,
      phone: profile.user.phone,
    };
  }

  async updateProfile(
    userId: string,
    changes: UpdateCustomerProfileRequest,
  ): Promise<CustomerProfile> {
    const result = await this.prisma.customerProfile.updateMany({
      where: { userId },
      data: {
        ...(changes.firstName !== undefined ? { firstName: changes.firstName } : {}),
        ...(changes.lastName !== undefined ? { lastName: changes.lastName } : {}),
        ...(changes.profileImageUrl !== undefined
          ? { profileImageUrl: changes.profileImageUrl }
          : {}),
      },
    });
    if (result.count === 0) throw notFound();
    return this.getProfile(userId);
  }

  async listAddresses(userId: string): Promise<Address[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toAddress);
  }

  /** Loads an address owned by the user, or 404 (never reveals other users' addresses). */
  async getOwnedAddress(userId: string, addressId: string): Promise<AddressRow> {
    const row = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!row) throw notFound();
    return row;
  }

  async createAddress(userId: string, input: CreateAddressRequest): Promise<Address> {
    const phone = requirePhone(input.phone);
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await this.clearDefault(tx, userId);
      return tx.address.create({
        data: {
          userId,
          label: input.label ?? null,
          recipientName: input.recipientName,
          phone,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2 ?? null,
          area: input.area ?? null,
          city: input.city,
          postalCode: input.postalCode ?? null,
          latitude: input.latitude,
          longitude: input.longitude,
          deliveryInstructions: input.deliveryInstructions ?? null,
          isDefault: input.isDefault ?? false,
        },
      });
    });
    return toAddress(row);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressRequest,
  ): Promise<Address> {
    await this.getOwnedAddress(userId, addressId);
    const phone = input.phone !== undefined ? requirePhone(input.phone) : undefined;
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await this.clearDefault(tx, userId);
      const data: Prisma.AddressUpdateInput = {};
      if (input.label !== undefined) data.label = input.label;
      if (input.recipientName !== undefined) data.recipientName = input.recipientName;
      if (phone !== undefined) data.phone = phone;
      if (input.addressLine1 !== undefined) data.addressLine1 = input.addressLine1;
      if (input.addressLine2 !== undefined) data.addressLine2 = input.addressLine2;
      if (input.area !== undefined) data.area = input.area;
      if (input.city !== undefined) data.city = input.city;
      if (input.postalCode !== undefined) data.postalCode = input.postalCode;
      if (input.latitude !== undefined) data.latitude = input.latitude;
      if (input.longitude !== undefined) data.longitude = input.longitude;
      if (input.deliveryInstructions !== undefined)
        data.deliveryInstructions = input.deliveryInstructions;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      return tx.address.update({ where: { id: addressId }, data });
    });
    return toAddress(row);
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const result = await this.prisma.address.deleteMany({ where: { id: addressId, userId } });
    if (result.count === 0) throw notFound();
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<Address> {
    await this.getOwnedAddress(userId, addressId);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.clearDefault(tx, userId);
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
    return toAddress(row);
  }

  /** Serializes default changes per user (row lock) so the one-default index never races. */
  private async clearDefault(tx: Tx, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }
}

function requirePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone)
    throw validationError({
      phone: 'Phone number must be in international format, e.g. +923001234567',
    });
  return phone;
}

export function toAddress(row: AddressRow): Address {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipientName,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    area: row.area,
    city: row.city,
    postalCode: row.postalCode,
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
    deliveryInstructions: row.deliveryInstructions,
    isDefault: row.isDefault,
  };
}
