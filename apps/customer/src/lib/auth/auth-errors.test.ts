import { ApiError, ApiTransportError } from '@quickbite/api-client';
import { toAuthErrorMessage } from './auth-errors';

describe('toAuthErrorMessage', () => {
  it('uses a generic message for invalid credentials and keeps the request id', () => {
    const result = toAuthErrorMessage(
      new ApiError(401, { code: 'AUTH_INVALID_CREDENTIALS', message: 'raw', requestId: 'req_1' }),
    );
    expect(result).toEqual({
      message: 'Incorrect email/phone number or password.',
      fields: {},
      requestId: 'req_1',
    });
  });

  it('exposes server field errors for VALIDATION_ERROR', () => {
    const result = toAuthErrorMessage(
      new ApiError(400, {
        code: 'VALIDATION_ERROR',
        message: 'raw',
        details: { fields: { phone: 'Phone number must be in international format' } },
      }),
    );
    expect(result.fields).toEqual({ phone: 'Phone number must be in international format' });
  });

  it('describes the backend password policy from its details', () => {
    const result = toAuthErrorMessage(
      new ApiError(400, {
        code: 'AUTH_PASSWORD_POLICY_VIOLATION',
        message: 'raw',
        details: { minLength: 8, maxLength: 128 },
      }),
    );
    expect(result.fields.password).toBe('Password must be between 8 and 128 characters.');
  });

  it('never shows raw backend messages for unknown codes', () => {
    const result = toAuthErrorMessage(
      new ApiError(500, { code: 'INTERNAL_ERROR', message: 'stack trace here' }),
    );
    expect(result.message).toBe('Something went wrong. Please try again.');
  });

  it('reports network failures', () => {
    expect(toAuthErrorMessage(new ApiTransportError('offline')).message).toMatch(/Can't reach/);
  });
});
