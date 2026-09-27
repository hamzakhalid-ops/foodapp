import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type ApiSuccessResponse } from '@quickbite/types';
import { map, type Observable } from 'rxjs';

/**
 * Wraps controller return values in the standard success envelope (API_SPEC §8).
 * Controllers return plain data; list endpoints return `{ data, meta }` via `ApiPage`.
 */
export class ApiPage<TItem> {
  constructor(
    readonly data: TItem[],
    readonly meta: NonNullable<ApiSuccessResponse<TItem[]>['meta']>,
  ) {}
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return next
      .handle()
      .pipe(
        map((value: unknown): ApiSuccessResponse<unknown> =>
          value instanceof ApiPage
            ? { success: true as const, data: value.data, meta: value.meta }
            : { success: true as const, data: value ?? null },
        ),
      );
  }
}
