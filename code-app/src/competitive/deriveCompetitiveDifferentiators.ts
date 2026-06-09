/**
 * Phase 142H — Competitive differentiator deriver.
 *
 * PURE. Lists OGB LOS differentiators, each labeled shipped or planned. It only
 * claims shipped capabilities as shipped; planned capabilities are labeled
 * planned. No overclaim versus reference platforms, no live-integration claim, no
 * final credit approval/decline claim, no operational data, no external calls.
 */

import type { CompetitiveDifferentiatorSummary } from './executiveStrategyTypes';

export interface DeriveCompetitiveDifferentiatorsInput {
  /** Optional shipped-capability hints from upstream stacks (annual review, boarding). */
  annualReviewShipped?: boolean;
  portfolioBoardingShipped?: boolean;
  platformConvergenceShipped?: boolean;
}

const SHIPPED: ReadonlyArray<Omit<CompetitiveDifferentiatorSummary, 'status'>> = [
  { key: 'regulated_bank_governance', title: 'Regulated-bank governance core', category: 'governance', detail: 'Audit, redaction, permission-before-render, and no-fake-data discipline across every surface.' },
  { key: 'evidence_backed_annual_review', title: 'Evidence-backed annual review', category: 'annual_review', detail: 'Annual review workflow with evidence-linked covenant testing and package automation (141A-P).' },
  { key: 'crm_relationship_master', title: 'CRM relationship master with authorization / do-not-contact', category: 'crm', detail: 'Governed relationship core honoring authorization and do-not-contact state (141B-H).' },
  { key: 'portfolio_boarded_loan_sor', title: 'Portfolio boarded-loan system of record', category: 'portfolio', detail: 'Boarded-loan SOR with monitoring (140A-Q).' },
  { key: 'fdic_examiner_package_draft', title: 'FDIC / examiner package draft automation', category: 'packages', detail: 'Examiner and board package draft automation (141P); export stays draft-only.' },
  { key: 'package_evidence_caveat_model', title: 'Package / evidence / caveat model', category: 'packages', detail: 'Evidence index and explicit caveats; missing data stays missing.' },
  { key: 'permission_before_render_workspace', title: 'Permission-before-render workspace model', category: 'governance', detail: 'Role-scoped surfaces enforced before render.' },
  { key: 'disabled_by_default_integrations', title: 'Disabled-by-default integrations', category: 'integrations', detail: 'Integration adapter registry where every provider is disabled and gated (142F); no provider is live.' },
  { key: 'admin_configuration_review_queue', title: 'Admin configuration review queue', category: 'admin', detail: 'Governed review-only configuration proposals; no apply, no schema mutation (142G).' },
  { key: 'no_fake_data_governance', title: 'No-fake-data governance', category: 'governance', detail: 'Derivers fail closed; no fabricated balances, payments, or operational data.' },
  { key: 'role_based_surfaces', title: 'Role-based executive / manager / portfolio / team / banker surfaces', category: 'workspace', detail: 'Distinct governed workspaces per role.' },
];

const PLANNED: ReadonlyArray<Omit<CompetitiveDifferentiatorSummary, 'status'>> = [
  { key: 'governed_copilot_assistance', title: 'Governed copilot workflow assistance (planned)', category: 'ai_copilot', detail: 'Planned, future, governed copilot assist; live assistance stays disabled until approved.' },
];

export function deriveCompetitiveDifferentiators(
  _input: DeriveCompetitiveDifferentiatorsInput = {},
): readonly CompetitiveDifferentiatorSummary[] {
  return [
    ...SHIPPED.map((d) => ({ ...d, status: 'shipped' as const })),
    ...PLANNED.map((d) => ({ ...d, status: 'planned' as const })),
  ];
}
