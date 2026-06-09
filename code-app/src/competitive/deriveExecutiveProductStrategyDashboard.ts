/**
 * Phase 142H — Executive product strategy dashboard deriver.
 *
 * PURE, READ-ONLY. Turns the Phase 142A capability matrix + backlog (and optional
 * downstream stack summaries) into a strategy dashboard state. Current score is
 * derived from SHIPPED capabilities only; target adds planned capabilities.
 * High-risk capabilities count as governed readiness, not live functionality.
 * External integrations show disabled, final credit approval shows forbidden,
 * admin apply shows false, package export shows draft-only. Missing inputs produce
 * caveats, never fake scores. No external fetch, no route registration.
 */

import { COMPETITIVE_CAPABILITY_MATRIX } from './competitiveCapabilityMatrix';
import { deriveCompetitiveImplementationBacklog, type CompetitiveImplementationBacklog } from './deriveCompetitiveImplementationBacklog';
import type { CompetitiveCapabilityMatrix } from './competitiveCapabilityTypes';
import type { CompetitiveRiskClass } from './deriveCompetitiveReferenceLessons';
import { deriveCompetitiveDifferentiators } from './deriveCompetitiveDifferentiators';
import { deriveCompetitiveGaps } from './deriveCompetitiveGaps';
import { deriveCompetitiveRoadmap } from './deriveCompetitiveRoadmap';
import type {
  CapabilityShipStatus,
  CompetitiveCapabilitySummary,
  CompetitiveReferencePlatformSummary,
  CompetitiveRiskSummary,
  CompetitiveSafetyPostureSummary,
  ExecutiveProductStrategyDashboardState,
  ExecutiveProductStrategyKpi,
} from './executiveStrategyTypes';

export interface DeriveExecutiveProductStrategyDashboardInput {
  /** Injected clock (ISO timestamp). */
  generatedAt: string;
  matrix?: CompetitiveCapabilityMatrix;
  backlog?: CompetitiveImplementationBacklog;
  /** Optional downstream stack presence — absence produces a caveat, not a fake score. */
  platformMetadataProvided?: boolean;
  workflowRoutingProvided?: boolean;
  productTemplateProvided?: boolean;
  servicingProvided?: boolean;
  integrationReadinessProvided?: boolean;
  adminConfigProvided?: boolean;
  annualReviewProvided?: boolean;
  portfolioBoardingProvided?: boolean;
}

function numericScore(matrix: CompetitiveCapabilityMatrix, categoryKey: string, platform: 'ogb_los_current' | 'ogb_los_target'): number | 'unknown' {
  const cell = matrix.categories.find((c) => c.categoryKey === categoryKey)?.cells.find((x) => x.sourcePlatform === platform);
  return typeof cell?.score === 'number' ? cell.score : 'unknown';
}

function maturityKpi(matrix: CompetitiveCapabilityMatrix, key: string, label: string, categoryKey: string): ExecutiveProductStrategyKpi {
  const current = numericScore(matrix, categoryKey, 'ogb_los_current');
  const target = numericScore(matrix, categoryKey, 'ogb_los_target');
  const status: CapabilityShipStatus = current === 'unknown' ? 'partial' : current === 0 ? 'blocked_disabled' : current >= 2 ? 'shipped' : 'partial';
  return { key, label, value: `${current === 'unknown' ? '?' : current}/${target === 'unknown' ? '?' : target}`, status };
}

const REFERENCE_PLATFORMS: readonly CompetitiveReferencePlatformSummary[] = [
  { platformKey: 'salesforce_ncino', name: 'Salesforce / nCino archetype', platformType: 'Commercial bank CRM + LOS platform', strongestLessons: ['Custom objects, list views, flow automation, reporting baseline', 'Bank-grade credit routing, underwriting workspace, committee support'], ogbAdoptionStatus: 'Adopting governed object/view metadata and read-only routing; no low-code schema mutation.', capabilityOverlap: 'High on CRM / routing / governance; OGB adds evidence-backed governance.', limitations: ['Proprietary; not self-hosted', 'Heavy customization risk'], recommendedUse: 'Reference for platform breadth and routing maturity.' },
  { platformKey: 'digifi_getsan4u_los', name: 'DigiFi / getsan4u LOS', platformType: 'Configurable LOS', strongestLessons: ['Unified underwriting, documents, tasks, e-sign, communications'], ogbAdoptionStatus: 'Unifying deal / CRM / documents / tasks under governed workflow.', capabilityOverlap: 'Medium on origination; e-sign stays disabled.', limitations: ['Public evidence limited; some capabilities not claimed'], recommendedUse: 'Reference for unified origination workflow.' },
  { platformKey: 'opencbs_los', name: 'OpenCBS LOS', platformType: 'Open-source core banking / LOS', strongestLessons: ['Product / client / channel / amount routing', 'First-class credit committee path'], ogbAdoptionStatus: 'Adopting configurable routing and committee findings; no final approval.', capabilityOverlap: 'Medium on routing / servicing.', limitations: ['Public evidence limited for some modules'], recommendedUse: 'Reference for routing and committee modeling.' },
  { platformKey: 'frappe_lending', name: 'Frappe Lending', platformType: 'Open-source lending on ERPNext', strongestLessons: ['Post-origination lifecycle: products, repayment, disbursement, collateral, accounting'], ogbAdoptionStatus: 'Adopting a read-only servicing/lifecycle model; no money movement.', capabilityOverlap: 'Medium on servicing lifecycle.', limitations: ['Accounting/payment operations remain disabled in OGB'], recommendedUse: 'Reference for servicing lifecycle structure.' },
  { platformKey: 'twenty_crm', name: 'Twenty CRM', platformType: 'Open-source CRM', strongestLessons: ['Flexible object model, views, workflows, code extensibility'], ogbAdoptionStatus: 'Adopting governed object/view metadata; no arbitrary UI schema mutation.', capabilityOverlap: 'Medium on object model.', limitations: ['Lighter bank governance'], recommendedUse: 'Reference for object/view flexibility.' },
  { platformKey: 'corteza', name: 'Corteza', platformType: 'Open-source low-code platform', strongestLessons: ['Custom objects, workflow automation, analytics, REST integration, self-hosting'], ogbAdoptionStatus: 'Adopting metadata-driven config and an integration registry; schema stays operator-script governed.', capabilityOverlap: 'Medium on low-code / integration.', limitations: ['Low-code schema mutation intentionally not adopted'], recommendedUse: 'Reference for integration registry and config modeling.' },
];

function buildSafetyPosture(): CompetitiveSafetyPostureSummary {
  return {
    items: [
      { category: 'Final credit approval / decline', status: 'forbidden', reason: 'Final credit decisions are never automated.', futureActivationPrerequisite: 'Not planned — remains a human decision.' },
      { category: 'Covenant waiver', status: 'forbidden', reason: 'Covenant exceptions are findings; no automated waiver.', futureActivationPrerequisite: 'Not planned — remains a human decision.' },
      { category: 'Borrower outreach', status: 'disabled', reason: 'Communications are preview / draft only.', futureActivationPrerequisite: 'Approval-gated send policy and DLP review.' },
      { category: 'Upload-link generation', status: 'disabled', reason: 'Behind a disabled adapter seam.', futureActivationPrerequisite: 'Secure link policy and human approval.' },
      { category: 'Live email / SMS', status: 'disabled', reason: 'No live messaging transport is configured.', futureActivationPrerequisite: 'Reviewed transport and approval-gated send.' },
      { category: 'Live integrations', status: 'disabled', reason: 'Every integration provider is disabled by default.', futureActivationPrerequisite: 'Policy approval, vendor due diligence, reviewed transport.' },
      { category: 'Credit bureau pull', status: 'disabled', reason: 'No credit is pulled.', futureActivationPrerequisite: 'Permissible purpose and human approval.' },
      { category: 'AML / KYC run', status: 'disabled', reason: 'No screening is executed.', futureActivationPrerequisite: 'Human approval and PII policy.' },
      { category: 'Core banking write', status: 'disabled', reason: 'Read-only metadata only; no core write.', futureActivationPrerequisite: 'Reviewed write controls and reconciliation.' },
      { category: 'Payment / disbursement / accounting', status: 'forbidden', reason: 'No money movement or accounting entries.', futureActivationPrerequisite: 'Core integration and reconciliation controls.' },
      { category: 'Schema mutation / custom fields', status: 'forbidden', reason: 'Dataverse schema stays operator-script governed.', futureActivationPrerequisite: 'Operator-script governed migration only.' },
      { category: 'Admin apply', status: 'review_only', reason: 'Admin configuration is review-only; validForApply is always false.', futureActivationPrerequisite: 'Controlled, review-gated apply workflow with audit.' },
      { category: 'Route registration', status: 'disabled', reason: 'No new route is registered by these surfaces.', futureActivationPrerequisite: 'Permission-gated route mounting (142I).' },
      { category: 'Package final export', status: 'disabled', reason: 'Packages are draft-only.', futureActivationPrerequisite: 'Reviewed export adapter and audit trail.' },
      { category: 'E-sign send', status: 'disabled', reason: 'No envelope is sent.', futureActivationPrerequisite: 'Vendor due diligence and approval-gated send.' },
    ],
    containsLiveIntegration: false,
    containsFinalApproval: false,
  };
}

function buildRiskSummary(backlog: CompetitiveImplementationBacklog): CompetitiveRiskSummary {
  const counts = new Map<CompetitiveRiskClass, number>();
  for (const item of backlog.items) counts.set(item.riskClass, (counts.get(item.riskClass) ?? 0) + 1);
  const byRiskClass = Array.from(counts.entries()).map(([riskClass, count]) => ({ riskClass, count }));
  const highRiskDisabledCount = backlog.items.filter((i) => i.riskClass === 'external_integration_disabled' || i.riskClass === 'runtime_write_disabled').length;
  return {
    totalBacklogItems: backlog.items.length,
    byRiskClass,
    highRiskDisabledCount,
    forbiddenCapabilities: backlog.forbidden.map((f) => f.capability),
  };
}

export function deriveExecutiveProductStrategyDashboard(
  input: DeriveExecutiveProductStrategyDashboardInput,
): ExecutiveProductStrategyDashboardState {
  const matrix = input.matrix ?? COMPETITIVE_CAPABILITY_MATRIX;
  const backlog = input.backlog ?? deriveCompetitiveImplementationBacklog();

  const capabilitySummaries: CompetitiveCapabilitySummary[] = matrix.categories.map((c) => {
    const current = numericScore(matrix, c.categoryKey, 'ogb_los_current');
    const target = numericScore(matrix, c.categoryKey, 'ogb_los_target');
    const status: CapabilityShipStatus =
      current === 'unknown' ? 'partial'
        : current === 0 ? 'blocked_disabled'
          : current >= 2 ? 'shipped'
            : 'partial';
    return { categoryKey: c.categoryKey, categoryName: c.categoryName, currentScore: current, targetScore: target, status };
  });

  const currentNumbers = capabilitySummaries.map((c) => (typeof c.currentScore === 'number' ? c.currentScore : 0));
  const targetNumbers = capabilitySummaries.map((c) => (typeof c.targetScore === 'number' ? c.targetScore : 0));
  const maxPer = 3;
  const currentSum = currentNumbers.reduce((a, b) => a + b, 0);
  const targetSum = targetNumbers.reduce((a, b) => a + b, 0);
  const denom = capabilitySummaries.length * maxPer;
  const currentCapabilityScore = denom > 0 ? Math.round((currentSum / denom) * 100) : 0;
  const targetCapabilityScore = denom > 0 ? Math.round((targetSum / denom) * 100) : 0;
  const competitiveCoveragePct = targetSum > 0 ? Math.round((currentSum / targetSum) * 100) : 0;

  const shippedCapabilityCount = capabilitySummaries.filter((c) => typeof c.currentScore === 'number' && c.currentScore >= 2).length;
  const plannedCapabilityCount = capabilitySummaries.filter((c) => typeof c.currentScore === 'number' && typeof c.targetScore === 'number' && c.targetScore > c.currentScore).length;
  const blockedCapabilityCount = capabilitySummaries.filter((c) => c.currentScore === 0).length;

  const differentiators = deriveCompetitiveDifferentiators();
  const gaps = deriveCompetitiveGaps();
  const roadmap = deriveCompetitiveRoadmap();
  const riskSummary = buildRiskSummary(backlog);
  const safetyPosture = buildSafetyPosture();

  const kpis: ExecutiveProductStrategyKpi[] = [
    { key: 'shipped_capabilities', label: 'Shipped platform capabilities', value: shippedCapabilityCount, status: 'shipped' },
    { key: 'planned_capabilities', label: 'Planned platform capabilities', value: plannedCapabilityCount, status: 'planned' },
    { key: 'high_risk_disabled', label: 'High-risk capabilities still disabled', value: riskSummary.highRiskDisabledCount, status: 'governed_readiness', caveat: 'Counted as governed readiness, not live functionality.' },
    maturityKpi(matrix, 'annual_review_maturity', 'Annual review automation maturity', 'annual_review'),
    maturityKpi(matrix, 'crm_maturity', 'CRM maturity', 'crm_relationship'),
    maturityKpi(matrix, 'portfolio_boarding_maturity', 'Portfolio boarding maturity', 'portfolio_monitoring'),
    maturityKpi(matrix, 'servicing_maturity', 'Servicing lifecycle maturity', 'servicing_lifecycle'),
    { key: 'integration_readiness_maturity', label: 'Integration readiness maturity', value: 'disabled / not configured', status: 'blocked_disabled', caveat: 'Every integration provider is disabled by default.' },
    maturityKpi(matrix, 'admin_governance_maturity', 'Admin governance maturity', 'audit_governance'),
    { key: 'convergence_score', label: 'Competitive platform convergence score', value: competitiveCoveragePct, unit: '%', status: 'governed_readiness' },
  ];

  const caveats: string[] = [];
  const optional: ReadonlyArray<[boolean | undefined, string]> = [
    [input.platformMetadataProvided, 'Platform metadata state'],
    [input.workflowRoutingProvided, 'Workflow routing state'],
    [input.productTemplateProvided, 'Product/process template state'],
    [input.servicingProvided, 'Servicing lifecycle state'],
    [input.integrationReadinessProvided, 'Integration readiness state'],
    [input.adminConfigProvided, 'Admin configuration queue state'],
    [input.annualReviewProvided, 'Annual review capability state'],
    [input.portfolioBoardingProvided, 'Portfolio boarding capability state'],
  ];
  for (const [provided, label] of optional) {
    if (!provided) caveats.push(`${label} not provided; using matrix-derived maturity only.`);
  }

  const executiveNarrative = {
    headline: 'OGB LOS is evolving into a governed banking operating system — read-only product strategy view.',
    whatShipped: differentiators.filter((d) => d.status === 'shipped').map((d) => d.title),
    whatRemains: gaps.map((g) => g.title),
    positioning: 'Governed, evidence-backed, permission-scoped convergence; integrations disabled by default and final credit decisions remain human.',
    caveats: [
      'Scores are strategic metadata derived from the capability matrix, not live operational performance.',
      'No live integration is enabled; final credit approval/decline and money movement remain forbidden.',
    ],
  };

  return {
    generatedAt: input.generatedAt,
    currentCapabilityScore,
    targetCapabilityScore,
    competitiveCoveragePct,
    shippedCapabilityCount,
    plannedCapabilityCount,
    blockedCapabilityCount,
    kpis,
    capabilitySummaries,
    differentiators,
    gaps,
    referencePlatforms: REFERENCE_PLATFORMS,
    roadmap,
    riskSummary,
    safetyPosture,
    executiveNarrative,
    caveats,
    auditSummary: {
      generatedAt: input.generatedAt,
      containsLiveIntegration: false,
      containsFinalApproval: false,
      containsOperationalData: false,
      containsOutreach: false,
      readOnly: true,
    },
  };
}

export { REFERENCE_PLATFORMS };
