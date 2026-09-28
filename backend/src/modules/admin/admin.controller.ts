import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AdminCustomer,
  type AdminCustomerDetail,
  type AdminCustomerListQuery,
  adminCustomerListQuerySchema,
  type AdminDashboard,
  type AdminOrderListQuery,
  adminOrderListQuerySchema,
  type AuditLog,
  type AuditLogListQuery,
  auditLogListQuerySchema,
  type ConfigurationEntry,
  type Order,
  type OrderSummary,
  reasonRequestSchema,
  type RestrictCustomerRequest,
  restrictCustomerRequestSchema,
  type RiskRestriction,
  type UpdateConfigurationRequest,
  updateConfigurationRequestSchema,
} from '@quickbite/validation';
import {
  AdminOnly,
  type AuthContext,
  CurrentAuth,
  RecentMfa,
  Roles,
} from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { notFound } from '../../common/http/errors';
import { cursorPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from '../orders/orders.service';
import { RiskAdminService } from '../risk/risk-admin.service';
import { AdminConfigurationService } from './admin-configuration.service';
import { AdminReadService } from './admin-read.service';

/** API_SPEC §94–95, §100, §107–108. */
@Controller('admin')
@AdminOnly()
export class AdminController {
  constructor(
    private readonly read: AdminReadService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly configuration: AdminConfigurationService,
    private readonly risk: RiskAdminService,
  ) {}

  @Get('dashboard')
  dashboard(): Promise<AdminDashboard> {
    return this.read.dashboard();
  }

  @Get('customers')
  async customers(
    @Query(new ZodValidationPipe(adminCustomerListQuerySchema)) query: AdminCustomerListQuery,
  ): Promise<ApiPage<AdminCustomer>> {
    const page = await this.read.customers(query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Get('customers/:customerId')
  customer(@Param('customerId', ParseUUIDPipe) customerId: string): Promise<AdminCustomerDetail> {
    return this.read.customer(customerId);
  }

  /**
   * ADMIN_SPEC §7: account restriction goes through the risk mechanism — an ACCOUNT_RESTRICTED
   * risk restriction, which checkout enforces. Audited by the risk service.
   */
  @Post('customers/:customerId/restrict')
  async restrict(
    @CurrentAuth() auth: AuthContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(restrictCustomerRequestSchema)) body: RestrictCustomerRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RiskRestriction> {
    await this.read.customer(customerId);
    return this.risk.createRestriction(
      {
        subjectType: 'CUSTOMER',
        subjectId: customerId,
        restrictionType: 'ACCOUNT_RESTRICTED',
        reason: body.reason,
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      },
      auth.userId,
      meta,
    );
  }

  @Post('customers/:customerId/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentAuth() auth: AuthContext,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<AdminCustomerDetail> {
    await this.read.customer(customerId);
    await this.risk.removeActiveOfType(
      'CUSTOMER',
      customerId,
      'ACCOUNT_RESTRICTED',
      body.reason,
      auth.userId,
      meta,
    );
    return this.read.customer(customerId);
  }

  @Get('orders')
  async orderList(
    @Query(new ZodValidationPipe(adminOrderListQuerySchema)) query: AdminOrderListQuery,
  ): Promise<ApiPage<OrderSummary>> {
    const page = await this.orders.adminList(query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Get('orders/:orderId')
  order(@Param('orderId', ParseUUIDPipe) orderId: string): Promise<Order> {
    return this.orders.getById(orderId);
  }

  @Get('audit-logs')
  async auditLogs(
    @Query(new ZodValidationPipe(auditLogListQuerySchema)) query: AuditLogListQuery,
  ): Promise<ApiPage<AuditLog>> {
    const page = await this.audit.list(query);
    return cursorPage(page.rows, query.limit, page.nextCursor);
  }

  @Get('audit-logs/:auditLogId')
  auditLog(@Param('auditLogId', ParseUUIDPipe) auditLogId: string): Promise<AuditLog> {
    return this.audit.get(auditLogId);
  }

  @Get('configuration')
  configurationList(): Promise<ConfigurationEntry[]> {
    return this.configuration.list();
  }

  @Get('configuration/:key')
  async configurationEntry(@Param('key') key: string): Promise<ConfigurationEntry> {
    const entry = (await this.configuration.list()).find((row) => row.key === key);
    if (!entry) throw notFound();
    return entry;
  }

  /** Sensitive system configuration: SUPER_ADMIN with step-up MFA, audited (ADMIN_RULES §5). */
  @Patch('configuration/:key')
  @Roles('SUPER_ADMIN')
  @RecentMfa()
  updateConfiguration(
    @CurrentAuth() auth: AuthContext,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateConfigurationRequestSchema)) body: UpdateConfigurationRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<ConfigurationEntry> {
    return this.configuration.update(key, body, auth.userId, meta);
  }
}
