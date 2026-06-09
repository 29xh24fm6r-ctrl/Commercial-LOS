/**
 * Phase 142A — Competitive capability matrix types.
 *
 * Product-strategy metadata only. No runtime behavior, no IO, no external calls.
 * Scores are deliberately conservative: `unknown` is preferred over overclaiming
 * a public repo's capabilities, and OGB-current reflects only shipped phases.
 */

export type CompetitivePlatform =
  | 'salesforce'
  | 'ncino'
  | 'digifi_getsan4u_los'
  | 'opencbs_los'
  | 'frappe_lending'
  | 'twenty_crm'
  | 'corteza'
  | 'ogb_los_current'
  | 'ogb_los_target';

export const COMPETITIVE_PLATFORMS: readonly CompetitivePlatform[] = Object.freeze([
  'salesforce',
  'ncino',
  'digifi_getsan4u_los',
  'opencbs_los',
  'frappe_lending',
  'twenty_crm',
  'corteza',
  'ogb_los_current',
  'ogb_los_target',
]);

export type CapabilityScore = 0 | 1 | 2 | 3 | 'unknown';

export type CapabilityConfidence = 'high' | 'medium' | 'low';

export interface CapabilityCell {
  sourcePlatform: CompetitivePlatform;
  score: CapabilityScore;
  rationale: string;
  confidence: CapabilityConfidence;
  evidenceNote: string;
  ogbAction?: string;
}

export interface CapabilityCategory {
  categoryKey: string;
  categoryName: string;
  cells: readonly CapabilityCell[];
}

export interface CompetitiveCapabilityMatrix {
  platforms: readonly CompetitivePlatform[];
  categories: readonly CapabilityCategory[];
}
