/**
 * Phase 142A — Competitive reference lesson deriver.
 *
 * PURE. Turns the capability matrix + reference-platform lessons into actionable,
 * governed product strategy. No recommendation bypasses governance, creates fake
 * data, enables borrower outreach by default, or enables final credit approval /
 * waiver automation. Every backlog item carries a risk class.
 */

import { COMPETITIVE_CAPABILITY_MATRIX } from './competitiveCapabilityMatrix';
import type { CompetitivePlatform, CompetitiveCapabilityMatrix } from './competitiveCapabilityTypes';

export type CompetitiveRiskClass =
  | 'read_only_strategy'
  | 'metadata_only'
  | 'runtime_read'
  | 'runtime_write_disabled'
  | 'runtime_write_enabled_later'
  | 'external_integration_disabled'
  | 'external_integration_enabled_later'
  | 'credit_decision_support'
  | 'credit_decision_final_forbidden';

export interface CompetitiveReferenceLesson {
  platform: CompetitivePlatform;
  lesson: string;
  ogbAction: string;
  riskClass: CompetitiveRiskClass;
}

export interface CompetitiveBacklogItem {
  key: string;
  title: string;
  category: string;
  riskClass: CompetitiveRiskClass;
  priority: number;
  rationale: string;
}

export interface CompetitiveReferenceLessonsResult {
  lessonsByPlatform: readonly CompetitiveReferenceLesson[];
  strengthsToAdopt: readonly string[];
  gapsToClose: readonly { categoryKey: string; categoryName: string; currentScore: unknown; targetScore: unknown }[];
  capabilitiesToAvoid: readonly { capability: string; riskClass: CompetitiveRiskClass }[];
  architectureRisks: readonly string[];
  prioritizedImplementationBacklog: readonly CompetitiveBacklogItem[];
  recommendedPhases: readonly string[];
}

const REFERENCE_LESSONS: readonly CompetitiveReferenceLesson[] = [
  { platform: 'digifi_getsan4u_los', lesson: 'Lending CRM and LOS should feel unified — underwriting, documents, tasks, e-sign, and communications as one workflow surface.', ogbAction: 'Unify Deal, CRM, Annual Review, Documents, Tasks, and Packages under one governed workflow model.', riskClass: 'runtime_read' },
  { platform: 'opencbs_los', lesson: 'Product/client/channel/amount-based workflow routing and a first-class credit committee path are critical.', ogbAction: 'Add configurable credit workflow routing and approval-stage definitions (no final approval).', riskClass: 'credit_decision_support' },
  { platform: 'frappe_lending', lesson: 'The loan lifecycle after origination matters: products, repayment, disbursement, collateral, accounting, compliance, reporting as explicit modules.', ogbAction: 'Add a servicing/lifecycle model without weakening commercial LOS governance.', riskClass: 'runtime_write_disabled' },
  { platform: 'twenty_crm', lesson: 'A flexible object model, views, workflows, and code extensibility create Salesforce-like platform power.', ogbAction: 'Add governed object/view/workflow metadata, but not arbitrary user-created schema mutation yet.', riskClass: 'metadata_only' },
  { platform: 'corteza', lesson: 'Custom objects, workflow automation, analytics, REST integration, and self-hosting are platform differentiators.', ogbAction: 'Add metadata-driven app config and an integration registry; Dataverse schema stays operator-script governed.', riskClass: 'external_integration_disabled' },
  { platform: 'salesforce', lesson: 'Custom objects, list views, flow automation, and reporting set the platform baseline.', ogbAction: 'Add governed object/view metadata and reporting surfaces (no low-code schema mutation).', riskClass: 'metadata_only' },
  { platform: 'ncino', lesson: 'Bank-grade credit routing, underwriting workspace, portfolio monitoring, and committee support are the LOS baseline.', ogbAction: 'Strengthen routing, underwriting convergence, and committee findings (no final approval).', riskClass: 'credit_decision_support' },
];

const CAPABILITIES_TO_AVOID: readonly { capability: string; riskClass: CompetitiveRiskClass }[] = [
  { capability: 'Arbitrary user-created schema / custom-field mutation from the UI.', riskClass: 'metadata_only' },
  { capability: 'Automatic borrower outreach (email/SMS/upload links) enabled by default.', riskClass: 'runtime_write_disabled' },
  { capability: 'Automatic final credit approval or decline.', riskClass: 'credit_decision_final_forbidden' },
  { capability: 'Automatic covenant waiver.', riskClass: 'credit_decision_final_forbidden' },
  { capability: 'External integrations (AML / bureau / scoring / core) enabled by default.', riskClass: 'external_integration_disabled' },
];

const ARCHITECTURE_RISKS: readonly string[] = [
  'Adding unmanaged framework dependencies that bypass governed build/test.',
  'Low-code schema drift if UI is allowed to mutate Dataverse schema.',
  'Hidden automation that sends or decides without human approval.',
  'Permission widening if new surfaces skip permission-before-render.',
];

const BACKLOG: readonly CompetitiveBacklogItem[] = [
  { key: 'platform_object_view_metadata', title: 'Governed platform object/view metadata surfaces', category: 'Platform object/view metadata', riskClass: 'metadata_only', priority: 1, rationale: 'Twenty/Corteza-style object+view power without UI schema mutation.' },
  { key: 'workflow_routing', title: 'Configurable workflow routing + credit committee route deriver', category: 'Workflow routing', riskClass: 'credit_decision_support', priority: 2, rationale: 'OpenCBS/nCino routing; findings only, no final approval.' },
  { key: 'product_process_templates', title: 'Product/process template registry for commercial loans', category: 'Product/process templates', riskClass: 'metadata_only', priority: 3, rationale: 'DigiFi/OpenCBS/Frappe configurability as static templates.' },
  { key: 'credit_committee_workflow', title: 'Credit committee workflow (read-only routing)', category: 'Credit committee workflow', riskClass: 'credit_decision_support', priority: 4, rationale: 'First-class committee finding; no approval mutation.' },
  { key: 'servicing_lifecycle', title: 'Servicing/lifecycle model inspired by Frappe Lending', category: 'Servicing/lifecycle module', riskClass: 'runtime_write_disabled', priority: 5, rationale: 'Post-origination lifecycle without weakening governance.' },
  { key: 'integration_adapter_registry', title: 'Integration adapter registry (AML/bureau/scoring/core)', category: 'Integration adapter seams', riskClass: 'external_integration_disabled', priority: 6, rationale: 'Adapter seams disabled by default.' },
  { key: 'reporting_analytics', title: 'Governed reporting/analytics surfaces', category: 'Reporting/analytics', riskClass: 'runtime_read', priority: 7, rationale: 'Salesforce/Corteza-style reporting, read-only.' },
  { key: 'admin_config_review_queue', title: 'Admin configuration review queue (future)', category: 'Admin configuration UI, future only', riskClass: 'metadata_only', priority: 8, rationale: 'Review-gated config; no schema mutation.' },
  { key: 'copilot_workflow_assist', title: 'AI/copilot workflow assistance (future)', category: 'AI/copilot workflow assistance, future only', riskClass: 'runtime_read', priority: 9, rationale: 'Governed copilot assist; live disabled until approved.' },
];

const RECOMMENDED_PHASES: readonly string[] = [
  'Phase 142B — Governed platform object/view metadata surfaces',
  'Phase 142C — Configurable workflow routing and credit committee route deriver',
  'Phase 142D — Product/process template registry for commercial loan workflows',
  'Phase 142E — Servicing/lifecycle model inspired by Frappe Lending',
  'Phase 142F — Integration adapter registry (AML/bureau/scoring/core), disabled by default',
  'Phase 142G — Admin configuration review queue, no schema mutation',
  'Phase 142H — Competitive dashboard and executive product strategy surface',
];

export interface DeriveCompetitiveReferenceLessonsInput {
  matrix?: CompetitiveCapabilityMatrix;
}

export function deriveCompetitiveReferenceLessons(
  input: DeriveCompetitiveReferenceLessonsInput = {},
): CompetitiveReferenceLessonsResult {
  const matrix = input.matrix ?? COMPETITIVE_CAPABILITY_MATRIX;

  const strengthsToAdopt = matrix.categories
    .filter((c) => {
      const target = c.cells.find((x) => x.sourcePlatform === 'ogb_los_target');
      const current = c.cells.find((x) => x.sourcePlatform === 'ogb_los_current');
      const bestRef = c.cells.filter((x) => x.sourcePlatform !== 'ogb_los_current' && x.sourcePlatform !== 'ogb_los_target' && typeof x.score === 'number').map((x) => x.score as number);
      const max = bestRef.length > 0 ? Math.max(...bestRef) : 0;
      return typeof current?.score === 'number' && typeof target?.score === 'number' && max >= 2 && current.score < max;
    })
    .map((c) => `${c.categoryName}: adopt mature patterns from reference platforms.`);

  const gapsToClose = matrix.categories
    .filter((c) => {
      const target = c.cells.find((x) => x.sourcePlatform === 'ogb_los_target')?.score;
      const current = c.cells.find((x) => x.sourcePlatform === 'ogb_los_current')?.score;
      return typeof current === 'number' && typeof target === 'number' && current < target;
    })
    .map((c) => ({
      categoryKey: c.categoryKey,
      categoryName: c.categoryName,
      currentScore: c.cells.find((x) => x.sourcePlatform === 'ogb_los_current')?.score,
      targetScore: c.cells.find((x) => x.sourcePlatform === 'ogb_los_target')?.score,
    }));

  return {
    lessonsByPlatform: REFERENCE_LESSONS,
    strengthsToAdopt,
    gapsToClose,
    capabilitiesToAvoid: CAPABILITIES_TO_AVOID,
    architectureRisks: ARCHITECTURE_RISKS,
    prioritizedImplementationBacklog: BACKLOG,
    recommendedPhases: RECOMMENDED_PHASES,
  };
}
