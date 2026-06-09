/**
 * Phase 142H — Executive product strategy surface: types.
 *
 * Strategy / product-intelligence metadata only. Scores derive from the Phase
 * 142A capability matrix + backlog; they are NOT live operational performance.
 * Nothing here claims live integrations are enabled, final credit
 * approval/decline is enabled, package export/sending is enabled, or admin
 * configuration apply is enabled. No customer/deal data, no external calls.
 * Disabled capabilities are named as literal-false structural fields
 * (`containsLiveIntegration: false`, `containsFinalApproval: false`) — governance
 * scans target EXECUTION patterns, not these fields.
 */

import type { CompetitiveRiskClass } from './deriveCompetitiveReferenceLessons';

export type CapabilityShipStatus = 'shipped' | 'planned' | 'partial' | 'blocked_disabled' | 'governed_readiness';

export interface ExecutiveProductStrategyKpi {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status: CapabilityShipStatus;
  caveat?: string;
}

export interface CompetitiveCapabilitySummary {
  categoryKey: string;
  categoryName: string;
  currentScore: number | 'unknown';
  targetScore: number | 'unknown';
  status: CapabilityShipStatus;
}

export interface CompetitiveDifferentiatorSummary {
  key: string;
  title: string;
  category: string;
  status: 'shipped' | 'planned';
  detail: string;
}

export interface CompetitiveGapSummary {
  gapKey: string;
  title: string;
  category: string;
  reason: string;
  riskClass: CompetitiveRiskClass;
  safetyBlocker: string;
  recommendedFuturePhase: string;
  prerequisite: string;
}

export interface CompetitiveReferencePlatformSummary {
  platformKey: string;
  name: string;
  platformType: string;
  strongestLessons: readonly string[];
  ogbAdoptionStatus: string;
  capabilityOverlap: string;
  limitations: readonly string[];
  recommendedUse: string;
}

export interface CompetitiveRoadmapItem {
  phaseId: string;
  title: string;
  riskClass: CompetitiveRiskClass;
}

export interface CompetitiveRoadmapPhase {
  phaseId: string;
  title: string;
  purpose: string;
  riskClass: CompetitiveRiskClass;
  prerequisites: readonly string[];
  expectedDeliverables: readonly string[];
  forbiddenActions: readonly string[];
  readinessCriteria: readonly string[];
}

export interface CompetitiveRiskSummary {
  totalBacklogItems: number;
  byRiskClass: readonly { riskClass: CompetitiveRiskClass; count: number }[];
  highRiskDisabledCount: number;
  forbiddenCapabilities: readonly string[];
}

export interface CompetitiveSafetyPostureItem {
  category: string;
  status: 'disabled' | 'forbidden' | 'review_only';
  reason: string;
  futureActivationPrerequisite: string;
}

export interface CompetitiveSafetyPostureSummary {
  items: readonly CompetitiveSafetyPostureItem[];
  /** Pinned false — no live integration / final approval is active. */
  containsLiveIntegration: false;
  containsFinalApproval: false;
}

export interface CompetitiveExecutiveNarrative {
  headline: string;
  whatShipped: readonly string[];
  whatRemains: readonly string[];
  positioning: string;
  caveats: readonly string[];
}

export interface CompetitiveStrategyAuditSummary {
  generatedAt: string;
  /** Pinned false — strategy surface only. */
  containsLiveIntegration: false;
  containsFinalApproval: false;
  containsOperationalData: false;
  containsOutreach: false;
  readOnly: true;
}

export interface ExecutiveProductStrategyDashboardState {
  generatedAt: string;
  currentCapabilityScore: number;
  targetCapabilityScore: number;
  competitiveCoveragePct: number;
  shippedCapabilityCount: number;
  plannedCapabilityCount: number;
  blockedCapabilityCount: number;
  kpis: readonly ExecutiveProductStrategyKpi[];
  capabilitySummaries: readonly CompetitiveCapabilitySummary[];
  differentiators: readonly CompetitiveDifferentiatorSummary[];
  gaps: readonly CompetitiveGapSummary[];
  referencePlatforms: readonly CompetitiveReferencePlatformSummary[];
  roadmap: readonly CompetitiveRoadmapPhase[];
  riskSummary: CompetitiveRiskSummary;
  safetyPosture: CompetitiveSafetyPostureSummary;
  executiveNarrative: CompetitiveExecutiveNarrative;
  caveats: readonly string[];
  auditSummary: CompetitiveStrategyAuditSummary;
}
