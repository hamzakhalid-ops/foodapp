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

/** Offset pagination query (API_SPEC §9). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Cursor pagination query (API_SPEC §10). */
export const cursorQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reasonRequestSchema = z.object({ reason: requiredText(500) }).strict();
