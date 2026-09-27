import { API_BASE_PATH, IDEMPOTENCY_KEY_HEADER, REQUEST_ID_HEADER } from '@quickbite/types';
import { apiErrorResponseSchema, apiSuccessResponseSchema } from '@quickbite/validation';
import { z } from 'zod';
import { ApiError, ApiTransportError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiClientOptions {
  /** Origin of the backend, e.g. `http://localhost:3000`. `/api/v1` is appended automatically. */
  baseUrl: string;
  /** Returns the current access token, or `null` when unauthenticated. */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Generates a request ID for `X-Request-ID`. Defaults to `req_<uuid>`. */
  createRequestId?: () => string;
  /** Injectable for tests and non-standard runtimes. Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

export interface RequestOptions<TSchema extends z.ZodType> {
  method: HttpMethod;
  /** Path relative to `/api/v1`, e.g. `/auth/me`. */
  path: string;
  /** Schema for the `data` field of the success envelope. */
  schema: TSchema;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Required for retry-sensitive operations (order creation, payments, refunds...).
   * Reuse the same key when retrying the same logical request. See API_SPEC §15.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiResult<TData> {
  data: TData;
  meta: Record<string, unknown> | undefined;
  requestId: string;
}

const successEnvelopeSchema = apiSuccessResponseSchema(z.unknown());

function defaultRequestId(): string {
  return `req_${globalThis.crypto.randomUUID()}`;
}

/** Creates a unique idempotency key for one logical operation. */
export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly options: ApiClientOptions;

  constructor(options: ApiClientOptions) {
    this.options = options;
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}${API_BASE_PATH}`;
  }

  async request<TSchema extends z.ZodType>(
    options: RequestOptions<TSchema>,
  ): Promise<ApiResult<z.infer<TSchema>>> {
    const requestId = (this.options.createRequestId ?? defaultRequestId)();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      [REQUEST_ID_HEADER]: requestId,
    };

    const token = await this.options.getAccessToken?.();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (options.idempotencyKey) {
      headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const fetchImpl = this.options.fetch ?? globalThis.fetch;
    let response: Response;
    try {
      const init: RequestInit = { method: options.method, headers };
      if (body !== undefined) init.body = body;
      if (options.signal) init.signal = options.signal;
      response = await fetchImpl(this.buildUrl(options.path, options.query), init);
    } catch (error) {
      throw new ApiTransportError('Network request failed', error);
    }

    const payload = await this.readJson(response);
    const serverRequestId = response.headers.get(REQUEST_ID_HEADER) ?? requestId;

    if (!response.ok) {
      const parsedError = apiErrorResponseSchema.safeParse(payload);
      if (parsedError.success) {
        throw new ApiError(response.status, {
          ...parsedError.data.error,
          requestId: parsedError.data.error.requestId ?? serverRequestId,
        });
      }
      throw new ApiTransportError(`Unexpected error response (HTTP ${response.status})`);
    }

    const envelope = successEnvelopeSchema.safeParse(payload);
    if (!envelope.success) {
      throw new ApiTransportError('Response did not match the API envelope', envelope.error);
    }
    const data = options.schema.safeParse(envelope.data.data);
    if (!data.success) {
      throw new ApiTransportError('Response data did not match the API contract', data.error);
    }

    return {
      data: data.data,
      meta: envelope.data.meta,
      requestId: serverRequestId,
    };
  }

  private buildUrl(path: string, query?: RequestOptions<z.ZodType>['query']): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async readJson(response: Response): Promise<unknown> {
    if (response.status === 204) return { success: true, data: null };
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new ApiTransportError(`Invalid JSON response (HTTP ${response.status})`, error);
    }
  }
}
