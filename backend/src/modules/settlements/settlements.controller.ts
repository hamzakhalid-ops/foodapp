import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AdjustmentListQuery,
  adjustmentListQuerySchema,
  type AdminSettlementListQuery,
  adminSettlementListQuerySchema,
  type CreateFinancialAdjustmentRequest,
  createFinancialAdjustmentRequestSchema,
  cursorQuerySchema,
  type FinancialAdjustment,
  type Invoice,
  type Payout,
  type PayoutListQuery,
  payoutListQuerySchema,
  type ReconciliationReport,
  type Settlement,
  type SettlementDetail,
  type SettlementListQuery,
  settlementListQuerySchema,
} from '@quickbite/validation';
import { type z } from 'zod';
import {
  AdminOnly,
  type AuthContext,
  CurrentAuth,
  RecentMfa,
  Roles,
} from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import { PayoutsService } from '../payouts/payouts.service';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantOwnerOnly,
} from '../restaurants/restaurant-access';
import { RidersService } from '../riders/riders.service';
import { ReconciliationService } from './reconciliation.service';
import { SettlementsService } from './settlements.service';

type CursorQuery = z.infer<typeof cursorQuerySchema>;

/** API_SPEC §60: owner-only, read-only (restaurants cannot modify settlement amounts). */
@Controller('restaurant')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
@RestaurantOwnerOnly()
export class RestaurantSettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly payouts: PayoutsService,
  ) {}

  @Get('settlements')
  async list(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(settlementListQuerySchema)) query: SettlementListQuery,
  ): Promise<ApiPage<Settlement>> {
    const page = await this.settlements.listForRecipient('RESTAURANT', access.restaurantId, query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Get('settlements/:settlementId')
  get(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
  ): Promise<SettlementDetail> {
    return this.settlements.detail(settlementId, { type: 'RESTAURANT', id: access.restaurantId });
  }

  @Get('payouts')
  async payoutList(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(payoutListQuerySchema)) query: PayoutListQuery,
  ): Promise<ApiPage<Payout>> {
    const page = await this.payouts.listForRecipient('RESTAURANT', access.restaurantId, query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Get('invoices')
  async invoices(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<ApiPage<Invoice>> {
    const page = await this.settlements.invoices(
      'RESTAURANT',
      access.restaurantId,
      query.limit,
      query.cursor,
    );
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }
}

/** API_SPEC §76: a rider's own settlements and payouts only. */
@Controller('rider')
@Roles('RIDER')
export class RiderSettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly payouts: PayoutsService,
    private readonly riders: RidersService,
  ) {}

  @Get('settlements')
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(settlementListQuerySchema)) query: SettlementListQuery,
  ): Promise<ApiPage<Settlement>> {
    const rider = await this.riders.requireByUser(auth.userId);
    const page = await this.settlements.listForRecipient('RIDER', rider.id, query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Get('settlements/:settlementId')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
  ): Promise<SettlementDetail> {
    const rider = await this.riders.requireByUser(auth.userId);
    return this.settlements.detail(settlementId, { type: 'RIDER', id: rider.id });
  }

  @Get('payouts')
  async payoutList(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(payoutListQuerySchema)) query: PayoutListQuery,
  ): Promise<ApiPage<Payout>> {
    const rider = await this.riders.requireByUser(auth.userId);
    const page = await this.payouts.listForRecipient('RIDER', rider.id, query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }
}

/**
 * API_SPEC §103. Reading is ADMIN; moving money (approve, process, adjust) is a sensitive
 * financial operation reserved to SUPER_ADMIN (ADMIN_RULES §5) and audited.
 */
@Controller('admin')
@AdminOnly()
export class AdminSettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get('settlements')
  async list(
    @Query(new ZodValidationPipe(adminSettlementListQuerySchema)) query: AdminSettlementListQuery,
  ): Promise<ApiPage<Settlement>> {
    const page = await this.settlements.list(query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Get('settlements/:settlementId')
  get(@Param('settlementId', ParseUUIDPipe) settlementId: string): Promise<SettlementDetail> {
    return this.settlements.detail(settlementId);
  }

  @Post('settlements/:settlementId/approve')
  @Roles('SUPER_ADMIN')
  @RecentMfa()
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<SettlementDetail> {
    return this.settlements.approve(settlementId, auth.userId, meta);
  }

  @Post('settlements/:settlementId/process')
  @Roles('SUPER_ADMIN')
  @RecentMfa()
  @HttpCode(HttpStatus.OK)
  @Idempotent()
  process(
    @CurrentAuth() auth: AuthContext,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @ReqMeta() meta: RequestMeta,
  ): Promise<SettlementDetail> {
    return this.settlements.process(settlementId, auth.userId, meta);
  }

  @Get('financial-adjustments')
  async adjustments(
    @Query(new ZodValidationPipe(adjustmentListQuerySchema)) query: AdjustmentListQuery,
  ): Promise<ApiPage<FinancialAdjustment>> {
    const page = await this.settlements.listAdjustments(query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Post('financial-adjustments')
  @Roles('SUPER_ADMIN')
  @RecentMfa()
  @Idempotent()
  adjust(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createFinancialAdjustmentRequestSchema))
    body: CreateFinancialAdjustmentRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<FinancialAdjustment> {
    return this.settlements.createAdjustment(body, auth.userId, meta);
  }

  @Get('finance/reconciliation')
  reconcile(): Promise<ReconciliationReport> {
    return this.reconciliation.run();
  }
}
