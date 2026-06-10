/**
 * Phase 146C — CRM relationship intelligence drill-through expansion.
 * Extends the Phase 143H/144E drill-through with richer sections.
 * Pure view model. No CRM lookup. No auto-link. No writeback.
 */

import { buildDrillThroughTarget, type DrillThroughTarget, type DetailSection } from '../../shared/drillthrough/drillThroughTypes';

export interface CrmRelationshipDrillThroughInput {
  relationshipName: string | undefined;
  salesforceAccountLabel: string | undefined;
  salesforceOpportunityLabel: string | undefined;
  ncinoRelationshipLabel: string | undefined;
  ncinoLoanLabel: string | undefined;
  matchConfidence: string | undefined;
  conflicts: readonly string[];
  contacts: readonly string[];
  activitySignals: readonly string[];
  documentSignals: readonly string[];
  crossSellSignals: readonly string[];
  nextSafeAction: string | undefined;
}

export function deriveCrmRelationshipDrillThroughTargets(
  input: CrmRelationshipDrillThroughInput,
): readonly DrillThroughTarget[] {
  const targets: DrillThroughTarget[] = [];
  const base = { surface: 'crm_relationship_intelligence' as const, entityKind: 'intelligence_panel' as const };

  targets.push(buildDrillThroughTarget({
    ...base,
    id: 'crm-rel-overview',
    title: 'Relationship Overview',
    summary: input.relationshipName ?? 'Relationship overview',
    detailSections: [
      makeSection('Identity', [
        { label: 'Relationship', value: input.relationshipName },
        { label: 'Match confidence', value: input.matchConfidence },
      ]),
    ],
  }));

  targets.push(buildDrillThroughTarget({
    ...base,
    id: 'crm-rel-salesforce',
    title: 'Salesforce References',
    summary: 'Salesforce account and opportunity references',
    detailSections: [
      makeSection('Salesforce', [
        { label: 'Account', value: input.salesforceAccountLabel },
        { label: 'Opportunity', value: input.salesforceOpportunityLabel },
      ]),
    ],
    unavailableReason: !input.salesforceAccountLabel && !input.salesforceOpportunityLabel
      ? 'No Salesforce references available'
      : undefined,
  }));

  targets.push(buildDrillThroughTarget({
    ...base,
    id: 'crm-rel-ncino',
    title: 'nCino References',
    summary: 'nCino relationship and loan references',
    detailSections: [
      makeSection('nCino', [
        { label: 'Relationship', value: input.ncinoRelationshipLabel },
        { label: 'Loan', value: input.ncinoLoanLabel },
      ]),
    ],
    unavailableReason: !input.ncinoRelationshipLabel && !input.ncinoLoanLabel
      ? 'No nCino references available'
      : undefined,
  }));

  if (input.conflicts.length > 0) {
    targets.push(buildDrillThroughTarget({
      ...base,
      id: 'crm-rel-conflicts',
      title: 'Conflicts',
      summary: `${input.conflicts.length} conflict(s)`,
      warnings: [...input.conflicts],
    }));
  }

  if (input.contacts.length > 0) {
    targets.push(buildDrillThroughTarget({
      ...base,
      id: 'crm-rel-contacts',
      title: 'Contacts / Relationship Roles',
      summary: `${input.contacts.length} contact(s)`,
      detailSections: [
        makeSection('Contacts', input.contacts.map((c) => ({ label: 'Contact', value: c }))),
      ],
    }));
  }

  if (input.activitySignals.length > 0) {
    targets.push(buildDrillThroughTarget({
      ...base,
      id: 'crm-rel-activity',
      title: 'Activity / Timeline Signals',
      summary: `${input.activitySignals.length} signal(s)`,
      detailSections: [
        makeSection('Activity', input.activitySignals.map((s) => ({ label: 'Signal', value: s }))),
      ],
    }));
  }

  if (input.crossSellSignals.length > 0) {
    targets.push(buildDrillThroughTarget({
      ...base,
      id: 'crm-rel-crosssell',
      title: 'Cross-Sell / Deposit Signals',
      summary: `${input.crossSellSignals.length} signal(s)`,
      detailSections: [
        makeSection('Cross-sell', input.crossSellSignals.map((s) => ({ label: 'Signal', value: s }))),
      ],
    }));
  }

  targets.push(buildDrillThroughTarget({
    ...base,
    id: 'crm-rel-next-action',
    title: 'Next Safe Action',
    summary: input.nextSafeAction ?? 'No next action identified from available data.',
  }));

  return targets;
}

function makeSection(title: string, rows: { label: string; value: string | undefined }[]): DetailSection {
  return {
    title,
    rows: rows.map((r) => ({
      label: r.label,
      value: r.value ?? 'Not available',
    })),
  };
}
