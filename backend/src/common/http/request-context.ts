import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from '@quickbite/types';

/** Accept client-supplied identifiers only when they are short and log-safe. */
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** `id` is populated by pino-http from `assignRequestContext`. */
export interface RequestWithContext extends IncomingMessage {
  correlationId?: string;
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  const single = Array.isArray(value) ? value[0] : value;
  return single !== undefined && SAFE_ID.test(single) ? single : undefined;
}

/**
 * Establishes request_id and correlation_id for a request (OBSERVABILITY_SPEC §4–6,
 * API_SPEC §14) and echoes them on the response. Used as pino-http's `genReqId`, so it runs
 * before any other handler.
 */
export function assignRequestContext(req: RequestWithContext, res: ServerResponse): string {
  const requestId = headerValue(req, REQUEST_ID_HEADER) ?? `req_${randomUUID()}`;
  const correlationId = headerValue(req, CORRELATION_ID_HEADER) ?? `corr_${randomUUID()}`;
  req.correlationId = correlationId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  return requestId;
}

export function getRequestId(req: RequestWithContext): string | undefined {
  const id: unknown = req.id;
  return typeof id === 'string' ? id : undefined;
}
