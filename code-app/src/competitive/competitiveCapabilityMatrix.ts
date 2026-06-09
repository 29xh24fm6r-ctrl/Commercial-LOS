/**
 * Phase 142A — Competitive capability matrix (constants only).
 *
 * Product-strategy metadata: 30 capability categories scored across 9 reference
 * platforms. Conservative by design — `unknown` (low confidence) is used wherever
 * public evidence is insufficient, and OGB-current reflects only shipped phases
 * (no claimed live sending / export / final approval).
 */

import {
  COMPETITIVE_PLATFORMS,
  type CompetitivePlatform,
  type CapabilityScore,
  type CapabilityConfidence,
  type CapabilityCell,
  type CapabilityCategory,
  type CompetitiveCapabilityMatrix,
} from './competitiveCapabilityTypes';

type Known = Partial<Record<CompetitivePlatform, [CapabilityScore, string, CapabilityConfidence?]>>;

function category(categoryKey: string, categoryName: string, known: Known, ogbAction: string): CapabilityCategory {
  const cells: CapabilityCell[] = COMPETITIVE_PLATFORMS.map((p) => {
    const k = known[p];
    const isOgb = p === 'ogb_los_current' || p === 'ogb_los_target';
    if (k) {
      return {
        sourcePlatform: p,
        score: k[0],
        rationale: k[1],
        confidence: k[2] ?? (isOgb ? 'high' : 'medium'),
        evidenceNote: isOgb ? 'Based on shipped/planned OGB LOS phases.' : 'Based on public product / repository documentation.',
        ogbAction: isOgb ? undefined : ogbAction,
      };
    }
    return {
      sourcePlatform: p,
      score: 'unknown',
      rationale: 'Insufficient public evidence to score precisely; not claimed.',
      confidence: 'low',
      evidenceNote: 'Insufficient public evidence.',
      ogbAction,
    };
  });
  return { categoryKey, categoryName, cells };
}

export const COMPETITIVE_CAPABILITY_CATEGORIES: readonly CapabilityCategory[] = Object.freeze([
  category('crm_relationship', 'CRM / relationship management', {
    salesforce: [3, 'Mature, central CRM platform.'], ncino: [3, 'Bank CRM on Salesforce.'], twenty_crm: [2, 'Modern open CRM core.'], corteza: [2, 'CRM module on a low-code platform.'], digifi_getsan4u_los: [1, 'Lending-centric, lighter CRM.'], opencbs_los: [1, 'Client management present.'], frappe_lending: [1, 'Customer records via ERPNext.'], ogb_los_current: [3, 'Shipped CRM Relationship Master (141B-H).'], ogb_los_target: [3, 'Relationship master plus convergence.'],
  }, 'Keep CRM Relationship Master as the governed relationship core.'),
  category('custom_object_model', 'Custom object model', {
    salesforce: [3, 'Custom objects core to the platform.'], twenty_crm: [3, 'Flexible object model.'], corteza: [3, 'Custom objects / modules.'], ncino: [2, 'Salesforce objects, bank-tuned.'], ogb_los_current: [2, 'Governed cr664 schema (no UI mutation).'], ogb_los_target: [2, 'Governed object metadata registry.'],
  }, 'Add a governed object metadata registry (no UI schema mutation).'),
  category('views_saved_lists', 'Views / saved lists', {
    salesforce: [3, 'List views central.'], twenty_crm: [2, 'Views feature.'], corteza: [2, 'Record lists.'], ogb_los_current: [1, 'Workspace routes; no saved-view metadata yet.'], ogb_los_target: [2, 'Governed static view registry.'],
  }, 'Add a governed (static) view registry; no user-created views yet.'),
  category('workflow_automation', 'Workflow automation', {
    salesforce: [3, 'Flow / process automation.'], ncino: [2, 'Loan workflow on Salesforce.'], corteza: [2, 'Workflow automation engine.'], twenty_crm: [1, 'Workflows emerging.'], opencbs_los: [2, 'Loan workflow routing.'], digifi_getsan4u_los: [2, 'Configurable LOS workflow.'], ogb_los_current: [1, 'Governed derivers; no low-code automation.'], ogb_los_target: [2, 'Configurable read-only routing deriver.'],
  }, 'Add configurable workflow routing as a read-only deriver.'),
  category('tasking_queues', 'Tasking / queues', {
    salesforce: [3, 'Tasks/queues mature.'], ncino: [2, 'Bank task queues.'], ogb_los_current: [2, 'Work queues shipped.'], ogb_los_target: [2, 'Queues plus routed tasks (adapter-gated).'],
  }, 'Keep work queues; task creation stays adapter-gated/disabled.'),
  category('loan_origination', 'Loan origination', {
    digifi_getsan4u_los: [2, 'LOS origination flow.'], opencbs_los: [2, 'Loan origination workflow.'], ncino: [3, 'Commercial LOS.'], frappe_lending: [2, 'Loan application lifecycle.'], ogb_los_current: [2, 'Deal workspace origination.'], ogb_los_target: [3, 'Unified origination workflow surface.'],
  }, 'Unify deal/CRM/documents/tasks under one governed origination surface.'),
  category('credit_approval_routing', 'Credit approval routing', {
    ncino: [3, 'Credit routing core.'], opencbs_los: [2, 'Approval path / committee.'], digifi_getsan4u_los: [2, 'Decisioning workflow.'], ogb_los_current: [1, 'Routing/findings only; no final approval.'], ogb_los_target: [2, 'Configurable routing deriver; no final approval.'],
  }, 'Add credit workflow routing + approval-stage definitions (no final approval).'),
  category('credit_committee', 'Credit committee support', {
    ncino: [2, 'Committee support.'], opencbs_los: [2, 'Committee approval path.'], ogb_los_current: [1, 'Routing can flag committee-required.'], ogb_los_target: [2, 'First-class committee route (read-only).'],
  }, 'Make credit-committee-required a first-class routing finding.'),
  category('underwriting_workspace', 'Underwriting workspace', {
    ncino: [3, 'Underwriting workspace.'], digifi_getsan4u_los: [2, 'Underwriting tooling.'], ogb_los_current: [2, 'Deal + financial/covenant analysis.'], ogb_los_target: [3, 'Converged underwriting workspace.'],
  }, 'Converge financial spread, covenants, and documents into underwriting.'),
  category('document_collection', 'Document collection', {
    digifi_getsan4u_los: [2, 'Document management.'], ncino: [3, 'Document collection.'], ogb_los_current: [3, 'Document checklist + collection shipped.'], ogb_los_target: [3, 'Collection plus delivery seams (disabled).'],
  }, 'Keep governed document collection; delivery seams stay disabled.'),
  category('document_classification', 'Document classification', {
    digifi_getsan4u_los: [1, 'Some classification.'], ogb_los_current: [3, 'Canonical document classification shipped.'], ogb_los_target: [3, 'Classification + evidence linkage.'],
  }, 'Keep canonical document classification as a differentiator.'),
  category('evidence_extraction', 'Evidence / fact extraction', {
    ogb_los_current: [3, 'Evidence-backed fact governance shipped.'], ogb_los_target: [3, 'Evidence index across packages.'],
  }, 'Keep evidence-backed governance as a core differentiator.'),
  category('esign_closing', 'E-sign / closing package readiness', {
    digifi_getsan4u_los: [2, 'E-sign integration.'], ncino: [2, 'Closing support.'], ogb_los_current: [0, 'Not shipped; no e-sign.'], ogb_los_target: [1, 'Closing-readiness model (no e-sign send).'],
  }, 'Model closing readiness; e-sign stays a future disabled seam.'),
  category('communications_outreach', 'Communications / borrower outreach', {
    salesforce: [3, 'Email/SMS marketing.'], ncino: [2, 'Borrower communications.'], digifi_getsan4u_los: [2, 'Communications module.'], ogb_los_current: [1, 'Preview/draft only; live sending disabled by default.'], ogb_los_target: [1, 'Approval-gated drafts; sending stays disabled.'],
  }, 'Keep outreach preview-only; sending remains disabled and approval-gated.'),
  category('secure_upload_links', 'Secure upload links', {
    digifi_getsan4u_los: [2, 'Borrower upload portal.'], ogb_los_current: [1, 'Upload-link adapter seam, disabled by default.'], ogb_los_target: [1, 'Adapter seam stays disabled until approved.'],
  }, 'Keep upload-link generation disabled behind the adapter seam.'),
  category('annual_review', 'Annual review', {
    ncino: [2, 'Portfolio review tooling.'], frappe_lending: [1, 'Periodic review limited.'], ogb_los_current: [3, 'Annual review workflow shipped (141A-P).'], ogb_los_target: [3, 'Annual review with packages.'],
  }, 'Keep the annual review workflow as a leading differentiator.'),
  category('covenant_testing', 'Covenant testing', {
    ncino: [2, 'Covenant monitoring.'], frappe_lending: [1, 'Limited covenant tracking.'], ogb_los_current: [3, 'Evidence-backed covenant testing (141O).'], ogb_los_target: [3, 'Covenant testing across packages.'],
  }, 'Keep evidence-backed covenant testing as a differentiator.'),
  category('portfolio_monitoring', 'Portfolio monitoring', {
    ncino: [3, 'Portfolio monitoring.'], frappe_lending: [2, 'Servicing/monitoring.'], ogb_los_current: [2, 'Portfolio boarded-loan SOR + monitoring.'], ogb_los_target: [3, 'Monitoring + servicing lifecycle.'],
  }, 'Extend portfolio monitoring with the servicing lifecycle model.'),
  category('servicing_lifecycle', 'Loan servicing / lifecycle operations', {
    frappe_lending: [3, 'Repayment/disbursement/accounting lifecycle.'], opencbs_los: [2, 'Servicing operations.'], ncino: [2, 'Servicing.'], ogb_los_current: [1, 'Portfolio boarding SOR; servicing partial.'], ogb_los_target: [2, 'Explicit servicing/lifecycle modules.'],
  }, 'Add a servicing/lifecycle model (Frappe-inspired) without weakening governance.'),
  category('collateral_insurance_ticklers', 'Collateral / insurance / ticklers', {
    ncino: [2, 'Collateral tracking.'], frappe_lending: [2, 'Security/collateral.'], ogb_los_current: [2, 'Collateral/insurance/tickler tracking shipped.'], ogb_los_target: [3, 'Collateral lifecycle + ticklers.'],
  }, 'Keep collateral/insurance/tickler tracking; extend in servicing.'),
  category('board_package', 'Board package support', {
    ogb_los_current: [3, 'Board package automation shipped (141P).'], ogb_los_target: [3, 'Board package automation.'],
  }, 'Keep board package automation as a differentiator.'),
  category('fdic_examiner_package', 'FDIC / examiner package support', {
    ogb_los_current: [3, 'FDIC/examiner package automation shipped (141P).'], ogb_los_target: [3, 'Examiner package automation.'],
  }, 'Keep FDIC/examiner package automation as a differentiator.'),
  category('low_code_customization', 'Low-code / customization', {
    salesforce: [3, 'Low-code platform.'], corteza: [3, 'Low-code app builder.'], twenty_crm: [2, 'Code + config extensibility.'], ogb_los_current: [0, 'No low-code UI schema mutation (by design).'], ogb_los_target: [1, 'Governed metadata config; no UI schema mutation.'],
  }, 'Add governed metadata config; Dataverse schema stays operator-script governed.'),
  category('api_integration', 'API / integration model', {
    salesforce: [3, 'Rich API.'], corteza: [3, 'REST API / integrations.'], twenty_crm: [2, 'GraphQL/REST API.'], frappe_lending: [2, 'Frappe REST API.'], ogb_los_current: [1, 'Dataverse/Power Platform APIs.'], ogb_los_target: [2, 'Integration adapter registry (disabled by default).'],
  }, 'Add an integration adapter registry; external integrations disabled by default.'),
  category('audit_governance', 'Audit and governance', {
    ncino: [2, 'Bank-grade controls.'], ogb_los_current: [3, 'Strong audit/governance + redaction (core).'], ogb_los_target: [3, 'Audit/governance across the platform.'],
  }, 'Keep audit/governance as the strongest differentiator.'),
  category('role_workspace', 'Role-based workspace model', {
    ncino: [2, 'Role-based bank workspaces.'], ogb_los_current: [3, 'Workspace security shipped.'], ogb_los_target: [3, 'Workspace model + object ownership.'],
  }, 'Keep the role-based workspace model.'),
  category('permission_before_render', 'Permission-before-render', {
    ogb_los_current: [3, 'Permission-before-render enforced.'], ogb_los_target: [3, 'Permission-before-render across surfaces.'],
  }, 'Keep permission-before-render as a hard rule.'),
  category('ai_copilot', 'AI / copilot readiness', {
    salesforce: [2, 'Einstein/Agentforce.'], twenty_crm: [1, 'Agents emerging.'], ogb_los_current: [1, 'Copilot seams; live disabled.'], ogb_los_target: [2, 'Copilot workflow assistance (future, governed).'],
  }, 'Keep Copilot seams disabled until governed enablement.'),
  category('reporting_analytics', 'Reporting / analytics', {
    salesforce: [3, 'Reports/dashboards.'], corteza: [2, 'Analytics/reporting.'], ncino: [2, 'Bank reporting.'], frappe_lending: [2, 'ERPNext reporting.'], ogb_los_current: [1, 'Command centers; limited analytics.'], ogb_los_target: [2, 'Governed reporting/analytics surfaces.'],
  }, 'Add governed reporting/analytics surfaces.'),
  category('deployment_self_hosting', 'Deployment / self-hosting', {
    corteza: [3, 'Docker/self-hosting.'], frappe_lending: [3, 'Self-hostable.'], twenty_crm: [2, 'Self-hostable.'], opencbs_los: [2, 'Self-hostable.'], ogb_los_current: [2, 'Power Platform / Dataverse hosted.'], ogb_los_target: [2, 'Power Platform hosted.'],
  }, 'Stay Power Platform / Dataverse native.'),
]);

export const COMPETITIVE_CAPABILITY_MATRIX: CompetitiveCapabilityMatrix = Object.freeze({
  platforms: COMPETITIVE_PLATFORMS,
  categories: COMPETITIVE_CAPABILITY_CATEGORIES,
});

export function capabilityCell(categoryKey: string, platform: CompetitivePlatform): CapabilityCell | undefined {
  return COMPETITIVE_CAPABILITY_CATEGORIES.find((c) => c.categoryKey === categoryKey)?.cells.find((cell) => cell.sourcePlatform === platform);
}
