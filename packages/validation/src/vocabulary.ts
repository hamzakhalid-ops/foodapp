import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  REVIEW_STATUSES,
  ROLES,
} from '@quickbite/types';
import { z } from 'zod';

// Schemas for parsing backend-provided values. They validate *shape*, not business rules.
export const roleSchema = z.enum(ROLES);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const promotionTypeSchema = z.enum(PROMOTION_TYPES);
export const promotionStatusSchema = z.enum(PROMOTION_STATUSES);
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
