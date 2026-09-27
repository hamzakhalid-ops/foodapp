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
  type CreateRiskEventRequest,
  createRiskEventRequestSchema,
  type CreateRiskRestrictionRequest,
  createRiskRestrictionRequestSchema,
  type CreateRiskRuleRequest,
  createRiskRuleRequestSchema,
  reasonRequestSchema,
  type RiskEvent,
  type RiskFlag,
  type RiskListQuery,
  riskListQuerySchema,
  type RiskRestriction,
  type RiskRule,
  type UpdateRiskRestrictionRequest,
  updateRiskRestrictionRequestSchema,
  type UpdateRiskRuleRequest,
  updateRiskRuleRequestSchema,
} from '@quickbite/validation';
import { AdminOnly, type AuthContext, CurrentAuth } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { RiskAdminService } from './risk-admin.service';

/** /api/v1/admin/risk — API_SPEC §84–87 (admin only; risk data is sensitive, RISK_RULES §39). */
@Controller('admin/risk')
@AdminOnly()
export class RiskAdminController {
  constructor(private readonly risk: RiskAdminService) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  async recordEvent(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createRiskEventRequestSchema)) body: CreateRiskEventRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<{ recorded: true }> {
    await this.risk.recordEvent(body, auth.userId, meta);
    return { recorded: true };
  }

  @Get('events')
  async events(
    @Query(new ZodValidationPipe(riskListQuerySchema)) query: RiskListQuery,
  ): Promise<ApiPage<RiskEvent>> {
    const { rows, nextCursor } = await this.risk.listEvents(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get('rules')
  rules(): Promise<RiskRule[]> {
    return this.risk.listRules();
  }

  @Post('rules')
  createRule(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createRiskRuleRequestSchema)) body: CreateRiskRuleRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RiskRule> {
    return this.risk.createRule(body, auth.userId, meta);
  }

  @Patch('rules/:ruleId')
  updateRule(
    @CurrentAuth() auth: AuthContext,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body(new ZodValidationPipe(updateRiskRuleRequestSchema)) body: UpdateRiskRuleRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RiskRule> {
    return this.risk.updateRule(ruleId, body, auth.userId, meta);
  }

  @Get('flags')
  async flags(
    @Query(new ZodValidationPipe(riskListQuerySchema)) query: RiskListQuery,
  ): Promise<ApiPage<RiskFlag>> {
    const { rows, nextCursor } = await this.risk.listFlags(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get('flags/:flagId')
  flag(@Param('flagId', ParseUUIDPipe) flagId: string) {
    return this.risk.getFlag(flagId);
  }

  @Post('flags/:flagId/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentAuth() auth: AuthContext,
    @Param('flagId', ParseUUIDPipe) flagId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.risk.closeFlag(flagId, 'RESOLVED', body.reason, auth.userId, meta);
  }

  @Post('flags/:flagId/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(
    @CurrentAuth() auth: AuthContext,
    @Param('flagId', ParseUUIDPipe) flagId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.risk.closeFlag(flagId, 'DISMISSED', body.reason, auth.userId, meta);
  }

  @Get('restrictions')
  async restrictions(
    @Query(new ZodValidationPipe(riskListQuerySchema)) query: RiskListQuery,
  ): Promise<ApiPage<RiskRestriction>> {
    const { rows, nextCursor } = await this.risk.listRestrictions(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Post('restrictions')
  createRestriction(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createRiskRestrictionRequestSchema))
    body: CreateRiskRestrictionRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RiskRestriction> {
    return this.risk.createRestriction(body, auth.userId, meta);
  }

  @Patch('restrictions/:restrictionId')
  updateRestriction(
    @CurrentAuth() auth: AuthContext,
    @Param('restrictionId', ParseUUIDPipe) restrictionId: string,
    @Body(new ZodValidationPipe(updateRiskRestrictionRequestSchema))
    body: UpdateRiskRestrictionRequest,
    @ReqMeta() meta: RequestMeta,
  ): Promise<RiskRestriction> {
    return this.risk.updateRestriction(restrictionId, body, auth.userId, meta);
  }

  @Post('restrictions/:restrictionId/remove')
  @HttpCode(HttpStatus.OK)
  removeRestriction(
    @CurrentAuth() auth: AuthContext,
    @Param('restrictionId', ParseUUIDPipe) restrictionId: string,
    @Body(new ZodValidationPipe(reasonRequestSchema)) body: { reason: string },
    @ReqMeta() meta: RequestMeta,
  ): Promise<RiskRestriction> {
    return this.risk.removeRestriction(restrictionId, body.reason, auth.userId, meta);
  }
}
