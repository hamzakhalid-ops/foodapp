import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { getRequestId, type RequestWithContext } from './request-context';

/** Client/request metadata used for sessions, security events and audit records. */
export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  correlationId: string | null;
}

export function readRequestMeta(request: Request): RequestMeta {
  const withContext = request as Request & RequestWithContext;
  const userAgent = request.get('user-agent');
  return {
    ipAddress: request.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
    requestId: getRequestId(withContext) ?? null,
    correlationId: withContext.correlationId ?? null,
  };
}

export const ReqMeta = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  readRequestMeta(context.switchToHttp().getRequest<Request>()),
);
