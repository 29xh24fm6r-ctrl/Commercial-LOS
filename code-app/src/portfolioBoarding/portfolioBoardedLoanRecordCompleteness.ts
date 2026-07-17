import { EXISTING_LOAN_CHILD_KEYS, type ExistingLoanChildKey } from './existingLoanEntryAdapter';

/**
 * Factory Arc Phase 9 — real per-loan record completeness for an already-boarded
 * portfolio loan. Pure projection over injected child-record COUNTS; no IO, no
 * fabricated numbers. The child groups are exactly the ten
 * `EXISTING_LOAN_CHILD_KEYS` the governed "Board existing loan" write path
 * (existingLoanEntryAdapter.ts) can create — reusing that real vocabulary
 * instead of inventing a separate "required record" taxonomy this app has no
 * source for.
 *
 * A count of `null` means the read for that group failed (fail-closed) — it is
 * NEVER treated as zero records, so a read failure can't be misread as "this
 * loan has no collateral."
 */

export const CHILD_GROUP_LABELS: Readonly<Record<ExistingLoanChildKey, string>> = Object.freeze({
  borrowers: 'Additional borrowers',
  collateral: 'Collateral',
  guarantors: 'Guarantors',
  covenants: 'Covenants',
  ticklers: 'Ticklers',
  insurance: 'Insurance',
  documents: 'Documents',
  exceptions: 'Exceptions',
  reviews: 'Reviews',
  examinerNotes: 'Examiner notes',
});

export interface ChildGroupCount {
  readonly key: ExistingLoanChildKey;
  readonly label: string;
  /** null = the read for this group failed; never treated as zero. */
  readonly count: number | null;
}

export interface PortfolioBoardedLoanRecordCompleteness {
  readonly groups: readonly ChildGroupCount[];
  /** Sum of successfully-read group counts (failed groups contribute 0 to this sum, but are tracked separately below). */
  readonly totalRecords: number;
  readonly groupsWithRecords: number;
  readonly groupsWithNoRecords: number;
  readonly groupsFailedToLoad: number;
}

export function deriveBoardedLoanRecordCompleteness(
  counts: Partial<Record<ExistingLoanChildKey, number | null>>,
): PortfolioBoardedLoanRecordCompleteness {
  const groups: ChildGroupCount[] = EXISTING_LOAN_CHILD_KEYS.map((key) => ({
    key,
    label: CHILD_GROUP_LABELS[key],
    count: counts[key] ?? null,
  }));

  let totalRecords = 0;
  let groupsWithRecords = 0;
  let groupsWithNoRecords = 0;
  let groupsFailedToLoad = 0;
  for (const g of groups) {
    if (g.count === null) {
      groupsFailedToLoad += 1;
    } else if (g.count > 0) {
      groupsWithRecords += 1;
      totalRecords += g.count;
    } else {
      groupsWithNoRecords += 1;
    }
  }

  return { groups, totalRecords, groupsWithRecords, groupsWithNoRecords, groupsFailedToLoad };
}
