/**
 * Phase PE-2 — Portfolio migration reconciliation / book tie-out.
 *
 * "Not done until it ties." A migrated portfolio must balance to an operator
 * control: the count and aggregate outstanding the operator recorded from the
 * source system, optionally broken out by segment (officer / product / segment)
 * and backed by an expected loan-number roster. This module is the PURE,
 * deterministic tie-out derivation — no IO, no Dataverse, no fabricated data.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no fetch, no clock. Deterministic for a given input.
 *   - Never invents loans or dollars: absent inputs reconcile to zero / empty.
 *   - Money compared at cent precision (float-safe), deltas are signed
 *     (boarded − control).
 */

/** Operator-entered subtotal for one segment (officer / product / segment). */
export interface MigrationControlSegmentSubtotal {
  readonly segment: string;
  readonly count: number;
  readonly outstanding: number;
}

/** The control totals an operator records for one migration batch. */
export interface MigrationControl {
  readonly batchId: string;
  readonly operator?: string;
  readonly enteredLoanCount: number;
  readonly enteredAggregateOutstanding: number;
  /** Optional per-segment subtotals; when present, each segment is tied out too. */
  readonly segmentSubtotals?: readonly MigrationControlSegmentSubtotal[];
  /**
   * Optional expected loan-number roster from the source-system extract. When
   * present, enables the two orphan lists (boarded-not-in-control and
   * in-control-not-yet-boarded); when absent, both lists are empty.
   */
  readonly expectedLoanNumbers?: readonly string[];
  readonly sourceDescription?: string;
  readonly enteredAt?: string;
}

/** A boarded loan participating in the tie-out. */
export interface ReconciliationLoan {
  readonly loanNumber: string | undefined;
  readonly outstanding: number | undefined;
  /** Batch this boarded loan belongs to; matched against the control's batchId. */
  readonly migrationBatchId?: string | undefined;
  /** Optional segment label (officer / product / segment) for per-segment tie-out. */
  readonly segment?: string | undefined;
}

export type ReconciliationStatus = 'tied' | 'out_of_balance';

/** A boarded-vs-control comparison with a signed delta (boarded − control). */
export interface ReconciliationDelta {
  readonly boarded: number;
  readonly control: number;
  readonly delta: number;
}

export interface SegmentReconciliation {
  readonly segment: string;
  readonly count: ReconciliationDelta;
  readonly outstanding: ReconciliationDelta;
  readonly status: ReconciliationStatus;
}

export interface MigrationReconciliation {
  readonly batchId: string;
  readonly count: ReconciliationDelta;
  readonly outstanding: ReconciliationDelta;
  readonly segments: readonly SegmentReconciliation[];
  /** Boarded loan numbers absent from the control roster (over-boarded). */
  readonly boardedNotInControl: readonly string[];
  /** Control-roster entries not yet boarded (still owed). */
  readonly inControlNotBoarded: readonly string[];
  readonly status: ReconciliationStatus;
}

/** Round to cents so float noise never shows a spurious delta. */
function cents(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function amount(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function delta(boarded: number, control: number): ReconciliationDelta {
  const b = cents(boarded);
  const c = cents(control);
  return { boarded: b, control: c, delta: cents(b - c) };
}

function isTied(count: ReconciliationDelta, outstanding: ReconciliationDelta): boolean {
  return count.delta === 0 && outstanding.delta === 0;
}

/** Normalize a loan number for matching (trim + upper); '' when blank. */
function key(loanNumber: string | undefined): string {
  return (loanNumber ?? '').trim().toUpperCase();
}

/**
 * Reconcile a boarded book against an operator control. Boarded rows carrying a
 * `migrationBatchId` that differs from the control's batch are excluded; rows
 * with no batch id are taken at caller scope. Returns count/$ deltas, per-segment
 * tie-out (when the control carries subtotals), the two orphan lists (when the
 * control carries an expected roster), and an overall `tied | out_of_balance`.
 */
export function deriveMigrationReconciliation(
  control: MigrationControl,
  boardedRows: readonly ReconciliationLoan[],
): MigrationReconciliation {
  const rows = boardedRows.filter(
    (r) => r.migrationBatchId == null || r.migrationBatchId === control.batchId,
  );

  const boardedCount = rows.length;
  const boardedOutstanding = rows.reduce((sum, r) => sum + amount(r.outstanding), 0);

  const count = delta(boardedCount, control.enteredLoanCount);
  const outstanding = delta(boardedOutstanding, control.enteredAggregateOutstanding);

  const segments = deriveSegments(control, rows);
  const { boardedNotInControl, inControlNotBoarded } = deriveOrphans(control, rows);

  const segmentsTied = segments.every((s) => s.status === 'tied');
  const status: ReconciliationStatus =
    isTied(count, outstanding) &&
    segmentsTied &&
    boardedNotInControl.length === 0 &&
    inControlNotBoarded.length === 0
      ? 'tied'
      : 'out_of_balance';

  return { batchId: control.batchId, count, outstanding, segments, boardedNotInControl, inControlNotBoarded, status };
}

function deriveSegments(
  control: MigrationControl,
  rows: readonly ReconciliationLoan[],
): readonly SegmentReconciliation[] {
  const controlSubtotals = control.segmentSubtotals ?? [];
  if (controlSubtotals.length === 0) return [];

  // Aggregate boarded rows by segment label.
  const boardedBySegment = new Map<string, { count: number; outstanding: number }>();
  for (const r of rows) {
    const seg = (r.segment ?? '').trim();
    if (seg.length === 0) continue;
    const acc = boardedBySegment.get(seg) ?? { count: 0, outstanding: 0 };
    acc.count += 1;
    acc.outstanding += amount(r.outstanding);
    boardedBySegment.set(seg, acc);
  }

  // Union of control-declared segments and any boarded segments, control order first.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const s of controlSubtotals) {
    if (!seen.has(s.segment)) { seen.add(s.segment); order.push(s.segment); }
  }
  for (const seg of boardedBySegment.keys()) {
    if (!seen.has(seg)) { seen.add(seg); order.push(seg); }
  }

  const controlBySegment = new Map(controlSubtotals.map((s) => [s.segment, s]));
  return order.map((segment) => {
    const boarded = boardedBySegment.get(segment) ?? { count: 0, outstanding: 0 };
    const ctrl = controlBySegment.get(segment);
    const count = delta(boarded.count, ctrl?.count ?? 0);
    const outstanding = delta(boarded.outstanding, ctrl?.outstanding ?? 0);
    return { segment, count, outstanding, status: isTied(count, outstanding) ? 'tied' : 'out_of_balance' };
  });
}

function deriveOrphans(
  control: MigrationControl,
  rows: readonly ReconciliationLoan[],
): { boardedNotInControl: string[]; inControlNotBoarded: string[] } {
  if (control.expectedLoanNumbers == null) {
    return { boardedNotInControl: [], inControlNotBoarded: [] };
  }

  const expected = control.expectedLoanNumbers.filter((n) => key(n).length > 0);
  const expectedKeys = new Set(expected.map(key));
  const boardedKeys = new Set(rows.map((r) => key(r.loanNumber)).filter((k) => k.length > 0));

  const boardedNotInControl = rows
    .filter((r) => key(r.loanNumber).length > 0 && !expectedKeys.has(key(r.loanNumber)))
    .map((r) => (r.loanNumber ?? '').trim());

  const inControlNotBoarded = expected.filter((n) => !boardedKeys.has(key(n))).map((n) => n.trim());

  return { boardedNotInControl, inControlNotBoarded };
}
