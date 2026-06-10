/**
 * Phase 144B — Deal cockpit (metric deck) drill-through adapters.
 *
 * Pure mappers from the already-derived deal cockpit metrics into read-only
 * {@link DrillThroughTarget}s for the six metric-deck tiles. No new loader, no
 * Dataverse query, no write, no borrower/deal mutation, no fake data — every
 * value comes from `deriveDealCockpitMetrics` output the deck already renders.
 */

import {
  buildDrillThroughTarget,
  type DetailRow,
  type DrillThroughTarget,
} from '../shared/drillthrough/drillThroughTypes';

/** Minimal projection of the metric-deck inputs the targets need. */
export interface DealMetricDeckDrillInput {
  loanAmountLabel: string;
  loanAmountKnown: boolean;
  missingFieldLabels: ReadonlyArray<string>;
  totalFieldCount: number;
  populatedFieldCount: number;
  taskOpenCount: number;
  taskOverdueCount: number;
  taskCompletedCount: number;
  docOutstandingCount: number;
  docReceivedCount: number;
  docReviewedCount: number;
  targetCloseLabel: string;
  daysToCloseLabel: string;
  memoStateLabel: string;
}

const SURFACE = 'deal_cockpit' as const;

/** All metric-deck tile targets, keyed by the tile label slug. */
export function dealMetricDeckTargets(input: DealMetricDeckDrillInput): Record<string, DrillThroughTarget> {
  const blockerCount = input.taskOverdueCount + input.docOutstandingCount;
  const missingRows: DetailRow[] = input.missingFieldLabels.map((label) => ({
    label,
    value: 'Not populated',
    source: 'tracked deal profile field',
  }));

  return {
    'loan-amount': buildDrillThroughTarget({
      id: 'deal-tile-loan-amount',
      title: 'Loan amount',
      subtitle: 'Deal metric',
      surface: SURFACE,
      entityKind: 'metric',
      summary: input.loanAmountKnown
        ? 'Authorized loan amount on this deal record.'
        : 'No loan amount is populated on this deal record yet.',
      sourceFields: input.loanAmountKnown
        ? [{ label: 'Loan amount', value: input.loanAmountLabel, source: 'authorized loan record' }]
        : undefined,
      unavailableReason: input.loanAmountKnown ? undefined : 'Loan amount is not set on the authorized deal record.',
    }),
    'missing-fields': buildDrillThroughTarget({
      id: 'deal-tile-missing-fields',
      // Title intentionally distinct from the "Missing fields" tile label so the
      // panel heading does not collide with deck tests querying that label.
      title: 'Profile completeness',
      subtitle: 'Deal metric',
      surface: SURFACE,
      entityKind: 'metric',
      summary: input.missingFieldLabels.length === 0
        ? 'All profile fields are populated on this deal.'
        : `${input.missingFieldLabels.length} of ${input.totalFieldCount} profile fields are not populated.`,
      sourceCounts: [
        { label: 'Populated', count: input.populatedFieldCount },
        { label: 'Missing', count: input.missingFieldLabels.length },
      ],
      detailSections: [{ title: 'Fields to populate', rows: missingRows, emptyMessage: 'No tracked field is missing.' }],
      nextReviewStep: input.missingFieldLabels.length > 0 ? 'Populate the empty profile fields to complete the deal.' : undefined,
    }),
    blockers: buildDrillThroughTarget({
      id: 'deal-tile-blockers',
      title: 'Blockers',
      subtitle: 'Deal metric',
      surface: SURFACE,
      entityKind: 'metric',
      summary: blockerCount === 0
        ? 'No attention items: no overdue tasks and no outstanding documents.'
        : `${blockerCount} attention item(s): overdue tasks and outstanding documents.`,
      sourceCounts: [
        { label: 'Overdue tasks', count: input.taskOverdueCount },
        { label: 'Outstanding documents', count: input.docOutstandingCount },
      ],
      nextReviewStep: blockerCount > 0 ? 'Clear overdue tasks and outstanding documents to unblock the deal.' : undefined,
    }),
    'tasks-open': buildDrillThroughTarget({
      id: 'deal-tile-tasks-open',
      title: 'Tasks open',
      subtitle: 'Deal metric',
      surface: SURFACE,
      entityKind: 'metric',
      summary: `${input.taskOpenCount} open task(s); ${input.taskOverdueCount} overdue, ${input.taskCompletedCount} completed.`,
      sourceCounts: [
        { label: 'Open', count: input.taskOpenCount },
        { label: 'Overdue', count: input.taskOverdueCount },
        { label: 'Completed', count: input.taskCompletedCount },
      ],
    }),
    documents: buildDrillThroughTarget({
      id: 'deal-tile-documents',
      title: 'Documents',
      subtitle: 'Deal metric',
      surface: SURFACE,
      entityKind: 'metric',
      summary: `${input.docOutstandingCount} outstanding; ${input.docReceivedCount} received, ${input.docReviewedCount} reviewed.`,
      sourceCounts: [
        { label: 'Outstanding', count: input.docOutstandingCount },
        { label: 'Received', count: input.docReceivedCount },
        { label: 'Reviewed', count: input.docReviewedCount },
      ],
    }),
    'target-close': buildDrillThroughTarget({
      id: 'deal-tile-target-close',
      title: 'Target close',
      subtitle: 'Deal metric',
      surface: SURFACE,
      entityKind: 'metric',
      summary: input.targetCloseLabel === 'No date set'
        ? 'No target close date is set on this deal.'
        : `Target close ${input.targetCloseLabel} (${input.daysToCloseLabel}).`,
      sourceFields: [
        { label: 'Target close', value: input.targetCloseLabel, source: 'authorized deal record' },
        { label: 'Memo state', value: input.memoStateLabel, source: 'credit memo' },
      ],
    }),
  };
}
