/**
 * Phase 144E — CRM relationship intelligence drill-through adapters.
 *
 * Pure mappers from the already-derived CRM cockpit sections into read-only
 * {@link DrillThroughTarget}s so each section can expose its status/detail and be
 * deep-linked. The payload comes entirely from the local view model — NEVER from
 * a URL param, and NEVER from a live Salesforce/nCino call. Nothing here syncs,
 * pushes, writes, or changes any external system.
 */

import {
  buildDrillThroughTarget,
  type DrillThroughTarget,
} from '../../shared/drillthrough/drillThroughTypes';
import type { CrmCockpitSection } from './crmRelationshipIntelligenceViewModel';

/** Section drill-through targets, keyed by the section key. */
export function crmRelationshipSectionTargets(
  sections: readonly CrmCockpitSection[],
  nextSafeStep: string,
): Record<string, DrillThroughTarget> {
  const out: Record<string, DrillThroughTarget> = {};
  for (const s of sections) {
    const statusLabel = s.status.replace(/_/g, ' ');
    out[s.key] = buildDrillThroughTarget({
      // Title carries a "details" suffix so the panel heading does not collide
      // with cockpit tests that exact-match the bare section title.
      id: `crm-rel-${s.key}`,
      title: `${s.title} — details`,
      subtitle: 'CRM relationship intelligence',
      surface: 'crm_relationship_intelligence',
      entityKind: 'intelligence_panel',
      statusLabel,
      summary:
        'Read-only CRM section detail from the current authorized page. No live Salesforce/nCino lookup, sync, push, or write occurs.',
      sourceFields: [
        { label: 'Status', value: statusLabel, source: 'CRM activation view model' },
        { label: 'Detail', value: s.detail, source: 'CRM activation view model' },
      ],
      nextReviewStep: nextSafeStep,
    });
  }
  return out;
}
