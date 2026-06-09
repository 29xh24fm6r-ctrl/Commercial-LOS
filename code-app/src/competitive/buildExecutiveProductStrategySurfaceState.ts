/**
 * Phase 142I — Executive product strategy surface state composer.
 *
 * PURE. Composes the Phase 142H dashboard state from STATIC registries and
 * derivers only. No fetch, no Dataverse, no CRM, no external URLs, no
 * customer/deal data, no fake operational metrics. A missing optional registry
 * input produces a caveat (never a fabricated score). It claims no live
 * integration, no admin apply, no final export, and no final credit approval.
 */

import { deriveExecutiveProductStrategyDashboard } from './deriveExecutiveProductStrategyDashboard';
import type { ExecutiveProductStrategyDashboardState } from './executiveStrategyTypes';

export interface BuildExecutiveProductStrategySurfaceStateInput {
  /** Injected clock (ISO timestamp). Defaults to the current time. */
  clock?: string;
  /** Optional registry availability — omit one to surface a caveat instead of a fake score. */
  includePlatformMetadata?: boolean;
  includeWorkflowRouting?: boolean;
  includeProductTemplates?: boolean;
  includeServicing?: boolean;
  includeIntegration?: boolean;
  includeAdminConfig?: boolean;
  includeAnnualReview?: boolean;
  includePortfolioBoarding?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function buildExecutiveProductStrategySurfaceState(
  input: BuildExecutiveProductStrategySurfaceStateInput = {},
): ExecutiveProductStrategyDashboardState {
  return deriveExecutiveProductStrategyDashboard({
    generatedAt: input.clock ?? nowIso(),
    platformMetadataProvided: input.includePlatformMetadata ?? true,
    workflowRoutingProvided: input.includeWorkflowRouting ?? true,
    productTemplateProvided: input.includeProductTemplates ?? true,
    servicingProvided: input.includeServicing ?? true,
    integrationReadinessProvided: input.includeIntegration ?? true,
    adminConfigProvided: input.includeAdminConfig ?? true,
    annualReviewProvided: input.includeAnnualReview ?? true,
    portfolioBoardingProvided: input.includePortfolioBoarding ?? true,
  });
}
