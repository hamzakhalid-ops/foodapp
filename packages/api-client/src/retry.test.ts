import { ApiError, ApiTransportError } from './errors';
import { shouldRetryQuery } from './retry';

describe('shouldRetryQuery', () => {
  it('never retries client errors', () => {
    const error = new ApiError(409, { code: 'ORDER_INVALID_STATUS', message: 'x' });
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('retries server and transport errors a bounded number of times', () => {
    const serverError = new ApiError(503, { code: 'INTERNAL_ERROR', message: 'x' });
    expect(shouldRetryQuery(0, serverError)).toBe(true);
    expect(shouldRetryQuery(2, serverError)).toBe(false);
    expect(shouldRetryQuery(1, new ApiTransportError('offline'))).toBe(true);
  });
});
