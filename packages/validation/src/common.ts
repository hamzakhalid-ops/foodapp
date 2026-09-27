import { z } from 'zod';

/** WGS 84 coordinates (MAPS_LOCATION_RULES §4–5). Zod 4 numbers already reject NaN/Infinity. */
export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

export const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const uuidSchema = z.uuid();

/** HTTPS URL for images/documents (object storage or CDN). */
export const httpsUrlSchema = z.url({ protocol: /^https$/ }).max(2048);
