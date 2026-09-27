import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { IDEMPOTENCY_KEY_HEADER } from '@quickbite/types';
import {
  type AdminPaymentListQuery,
  adminPaymentListQuerySchema,
  type AdminRefundListQuery,
  adminRefundListQuerySchema,
  type CreatePaymentRequest,
  createPaymentRequestSchema,
  type Payment,
  type PaymentMethodInfo,
  type Refund,
  type RefundDecisionRequest,
  refundDecisionRequestSchema,
  type RefundRequest,
  refundRequestSchema,
} from '@quickbite/validation';
import { type Request } from 'express';
import {
  AdminOnly,
  type AuthContext,
  CurrentAuth,
  Public,
  Roles,
} from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';

/** API_SPEC §77–82 */
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  @Get('payment-methods')
  @Roles('CUSTOMER')
  methods(@CurrentAuth() auth: AuthContext): Promise<PaymentMethodInfo[]> {
    return this.payments.paymentMethods(auth.userId);
  }

  @Post('payments')
  @Roles('CUSTOMER')
  @Idempotent()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createPaymentRequestSchema)) body: CreatePaymentRequest,
    @Headers(IDEMPOTENCY_KEY_HEADER.toLowerCase()) idempotencyKey: string | undefined,
  ): Promise<Payment> {
    return this.payments.initiate(auth.userId, body, idempotencyKey ?? null);
  }

  @Get('payments/:paymentId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<Payment> {
    return this.payments.getForActor(paymentId, auth);
  }

  @Post('payments/:paymentId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<Payment> {
    return this.payments.confirm(paymentId, auth);
  }

  @Post('payments/:paymentId/refund')
  @AdminOnly()
  @Idempotent()
  refund(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body(new ZodValidationPipe(refundRequestSchema)) body: RefundRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Refund> {
    return this.refunds.refund(paymentId, body, auth.userId, meta);
  }
}

/** API_SPEC §81 — provider webhooks, authenticated by signature instead of a session. */
@Controller('webhooks/payments')
@Public()
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ received: true; duplicate: boolean }> {
    const result = await this.payments.handleWebhook(provider, request.rawBody, request.headers);
    return { received: true, duplicate: result.duplicate };
  }
}

/** API_SPEC §102 and the ADR-0014 §9 refund decision. */
@Controller('admin')
@AdminOnly()
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  @Get('payments')
  async list(
    @Query(new ZodValidationPipe(adminPaymentListQuerySchema)) query: AdminPaymentListQuery,
  ): Promise<ApiPage<Payment>> {
    const { rows, nextCursor } = await this.payments.adminList(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get('payments/:paymentId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<Payment> {
    return this.payments.getForActor(paymentId, auth);
  }

  @Get('refunds')
  async listRefunds(
    @Query(new ZodValidationPipe(adminRefundListQuerySchema)) query: AdminRefundListQuery,
  ): Promise<ApiPage<Refund>> {
    const { rows, nextCursor } = await this.refunds.adminList(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get('refunds/:refundId')
  getRefund(@Param('refundId', ParseUUIDPipe) refundId: string): Promise<Refund> {
    return this.refunds.view(refundId);
  }

  @Post('orders/:orderId/refund-decision')
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  decide(
    @CurrentAuth() auth: AuthContext,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodValidationPipe(refundDecisionRequestSchema)) body: RefundDecisionRequest,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.refunds.decide(orderId, body, auth.userId, meta);
  }
}
