/**
 * Phase 142A — Competitive implementation backlog deriver.
 *
 * PURE. Produces the prioritized, risk-classed backlog and recommended next
 * phases. All future external integrations are disabled by default, all credit
 * decision finalization remains forbidden, all admin mutation is review-gated,
 * and all dynamic schema changes remain operator-script governed.
 */

import {
  deriveCompetitiveReferenceLessons,
  type CompetitiveBacklogItem,
  type CompetitiveRiskClass,
} from './deriveCompetitiveReferenceLessons';

export interface CompetitiveImplementationBacklog {
  categories: readonly string[];
  items: readonly CompetitiveBacklogItem[];
  recommendedPhases: readonly string[];
  forbidden: readonly { capability: string; riskClass: CompetitiveRiskClass }[];
}

const BACKLOG_CATEGORIES: readonly string[] = [
  'Platform object/view metadata',
  'Workflow routing',
  'Product/process templates',
  'Credit committee workflow',
  'Servicing/lifecycle module',
  'Integration adapter seams',
  'Reporting/analytics',
  'Admin configuration UI, future only',
  'AI/copilot workflow assistance, future only',
];

export function deriveCompetitiveImplementationBacklog(): CompetitiveImplementationBacklog {
  const lessons = deriveCompetitiveReferenceLessons();
  const items = [...lessons.prioritizedImplementationBacklog].sort((a, b) => a.priority - b.priority);

  return {
    categories: BACKLOG_CATEGORIES,
    items,
    recommendedPhases: lessons.recommendedPhases,
    forbidden: [
      { capability: 'Final credit approval / decline automation', riskClass: 'credit_decision_final_forbidden' },
      { capability: 'Automatic covenant waiver', riskClass: 'credit_decision_final_forbidden' },
    ],
  };
}
