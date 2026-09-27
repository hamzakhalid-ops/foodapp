import { HttpStatus, type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';
import { ApiException } from './api.exception';

/**
 * Validates a request body against a shared Zod schema (@quickbite/validation).
 * Errors report field paths and messages only — never the submitted values.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;

    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '(body)';
      fields[path] ??= issue.message;
    }
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'The request failed validation.',
      { fields },
    );
  }
}
