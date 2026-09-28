import {
  type CreateRiskEventInput,
  type CreateRiskRestrictionRequest,
  type CreateRiskRuleInput,
  type RiskEvent,
  riskEventSchema,
  type RiskFlag,
  riskFlagSchema,
  type RiskListQuery,
  type RiskRestriction,
  riskRestrictionSchema,
  type RiskRule,
  riskRuleSchema,
  type UpdateRiskRestrictionRequest,
  type UpdateRiskRuleRequest,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

const id = (value: string) => encodeURIComponent(value);
const base = '/admin/risk';

/** Admin Trust & Risk endpoints (docs/api/API_SPEC.md §84–87). */
export function createAdminRiskApi(client: ApiClient) {
  const list = <T extends z.ZodType>(path: string, schema: T, query: Partial<RiskListQuery>) =>
    client.request({ method: 'GET', path: `${base}${path}`, schema: z.array(schema), query });
  return {
    recordEvent: async (body: CreateRiskEventInput): Promise<void> => {
      await client.request({ method: 'POST', path: `${base}/events`, body, schema: z.unknown() });
    },
    listEvents: (query: Partial<RiskListQuery> = {}): Promise<ApiResult<RiskEvent[]>> =>
      list('/events', riskEventSchema, query),
    listRules: async (): Promise<RiskRule[]> =>
      (
        await client.request({
          method: 'GET',
          path: `${base}/rules`,
          schema: z.array(riskRuleSchema),
        })
      ).data,
    createRule: async (body: CreateRiskRuleInput): Promise<RiskRule> =>
      (
        await client.request({
          method: 'POST',
          path: `${base}/rules`,
          body,
          schema: riskRuleSchema,
        })
      ).data,
    updateRule: async (ruleId: string, body: UpdateRiskRuleRequest): Promise<RiskRule> =>
      (
        await client.request({
          method: 'PATCH',
          path: `${base}/rules/${id(ruleId)}`,
          body,
          schema: riskRuleSchema,
        })
      ).data,
    listFlags: (query: Partial<RiskListQuery> = {}): Promise<ApiResult<RiskFlag[]>> =>
      list('/flags', riskFlagSchema, query),
    getFlag: async (flagId: string) =>
      (
        await client.request({
          method: 'GET',
          path: `${base}/flags/${id(flagId)}`,
          schema: riskFlagSchema.extend({ restrictions: z.array(riskRestrictionSchema) }),
        })
      ).data,
    resolveFlag: (flagId: string, reason: string) =>
      client.request({
        method: 'POST',
        path: `${base}/flags/${id(flagId)}/resolve`,
        body: { reason },
        schema: z.unknown(),
      }),
    dismissFlag: (flagId: string, reason: string) =>
      client.request({
        method: 'POST',
        path: `${base}/flags/${id(flagId)}/dismiss`,
        body: { reason },
        schema: z.unknown(),
      }),
    listRestrictions: (query: Partial<RiskListQuery> = {}): Promise<ApiResult<RiskRestriction[]>> =>
      list('/restrictions', riskRestrictionSchema, query),
    createRestriction: async (body: CreateRiskRestrictionRequest): Promise<RiskRestriction> =>
      (
        await client.request({
          method: 'POST',
          path: `${base}/restrictions`,
          body,
          schema: riskRestrictionSchema,
        })
      ).data,
    updateRestriction: async (
      restrictionId: string,
      body: UpdateRiskRestrictionRequest,
    ): Promise<RiskRestriction> =>
      (
        await client.request({
          method: 'PATCH',
          path: `${base}/restrictions/${id(restrictionId)}`,
          body,
          schema: riskRestrictionSchema,
        })
      ).data,
    removeRestriction: async (restrictionId: string, reason: string): Promise<RiskRestriction> =>
      (
        await client.request({
          method: 'POST',
          path: `${base}/restrictions/${id(restrictionId)}/remove`,
          body: { reason },
          schema: riskRestrictionSchema,
        })
      ).data,
  };
}
