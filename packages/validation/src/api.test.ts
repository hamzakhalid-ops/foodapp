import { z } from 'zod';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  isKnownApiErrorCode,
  moneyAmountSchema,
} from './api';

describe('API envelope schemas', () => {
  it('parses a standard error response', () => {
    const parsed = apiErrorResponseSchema.parse({
      success: false,
      error: {
        code: 'ORDER_INVALID_STATUS',
        message: 'This order cannot be cancelled in its current state.',
        details: {},
        requestId: 'req_123',
      },
    });
    expect(parsed.error.code).toBe('ORDER_INVALID_STATUS');
    expect(isKnownApiErrorCode(parsed.error.code)).toBe(true);
  });

  it('keeps unknown error codes but flags them', () => {
    expect(isKnownApiErrorCode('SOMETHING_NEW')).toBe(false);
  });

  it('parses a success envelope with a typed payload', () => {
    const schema = apiSuccessResponseSchema(z.object({ id: z.string() }));
    expect(schema.parse({ success: true, data: { id: 'ord_123' } }).data.id).toBe('ord_123');
  });

  it('accepts decimal-string money and rejects floats', () => {
    expect(moneyAmountSchema.safeParse('1250.50').success).toBe(true);
    expect(moneyAmountSchema.safeParse('1250.505').success).toBe(false);
    expect(moneyAmountSchema.safeParse(1250.5).success).toBe(false);
  });
});
