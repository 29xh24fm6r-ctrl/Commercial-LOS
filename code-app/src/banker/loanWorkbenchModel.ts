import type { PipelineDeal } from './dealQueries';
import type { WorkQueueTaskRow } from './workQueueQueries';

/**
 * Phase 258 — Loan Workflow workbench model.
 *
 * Pure derivation that turns the banker's authorized active deals + open tasks
 * into a lending workbench: a deal table (name, borrower, stage, status,
 * amount, owner, next action, last activity) plus four section groupings —
 * My Active Deals, Recently Created, Closing Soon, Needs Attention. No live
 * calls, no fabricated rows: every value comes from the loaded deal/task data.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CLOSING_SOON_DAYS = 14;
const STALE_DAYS = 14;
const RECENT_DAYS = 30;

export type WorkbenchSectionKey = 'active' | 'recent' | 'closing' | 'attention';

export interface WorkbenchSectionSpec {
  readonly key: WorkbenchSectionKey;
  readonly label: string;
}

export const WORKBENCH_SECTIONS: readonly WorkbenchSectionSpec[] = Object.freeze([
  { key: 'active', label: 'My Active Deals' },
  { key: 'recent', label: 'Recently Created' },
  { key: 'closing', label: 'Closing Soon' },
  { key: 'attention', label: 'Needs Attention' },
]);

export interface WorkbenchRow {
  readonly id: string;
  readonly name: string;
  readonly borrower: string | undefined;
  readonly stage: string | undefined;
  readonly status: string | undefined;
  readonly amount: number | undefined;
  readonly owner: string;
  readonly nextAction: string;
  readonly lastActivity: string | undefined;
  readonly createdOn: string | undefined;
  readonly targetCloseDate: string | undefined;
  /** Section memberships this row belongs to. */
  readonly sections: readonly WorkbenchSectionKey[];
  /**
   * D-01 fix — true for a classified test/smoke deal (see
   * testDealClassification.ts). The row still belongs to its sections (so
   * search and section-browsing find it), but it is excluded from the
   * section COUNT tallies below so the queue-card numbers stay an
   * operational-only KPI.
   */
  readonly isTestRecord?: boolean;
}

export interface WorkbenchModel {
  readonly rows: readonly WorkbenchRow[];
  readonly counts: Readonly<Record<WorkbenchSectionKey, number>>;
}

function parseTime(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

/** Earliest-due open task title for a deal, or a safe default. */
function nextActionFor(dealId: string, tasks: readonly WorkQueueTaskRow[]): string {
  const open = tasks.filter((t) => t.dealId === dealId && !t.completed);
  if (open.length === 0) return 'Open workflow';
  const sorted = open.slice().sort((a, b) => {
    const at = parseTime(a.dueDate) ?? Number.POSITIVE_INFINITY;
    const bt = parseTime(b.dueDate) ?? Number.POSITIVE_INFINITY;
    return at - bt;
  });
  return sorted[0]!.title;
}

function hasOverdueTask(dealId: string, tasks: readonly WorkQueueTaskRow[], nowMs: number): boolean {
  return tasks.some((t) => {
    if (t.dealId !== dealId || t.completed) return false;
    const due = parseTime(t.dueDate);
    return due !== undefined && due < nowMs;
  });
}

export function deriveLoanWorkbench(
  deals: readonly PipelineDeal[],
  tasks: readonly WorkQueueTaskRow[],
  ownerName: string | undefined,
  now: Date,
): WorkbenchModel {
  const nowMs = now.getTime();
  // Defensive: ownerName is sourced from the resolved banker identity
  // (cr664_fullname), which can be null/empty for a freshly provisioned
  // banker record. A bare `.trim()` here would throw inside the render-phase
  // useMemo and crash the whole Loan Workflow tab. Tasks/deals are likewise
  // coerced so a partial live payload can never throw during derivation.
  const owner = (ownerName ?? '').trim().length > 0 ? (ownerName as string) : 'You';
  const safeDeals = deals ?? [];
  const safeTasks = tasks ?? [];

  const rows: WorkbenchRow[] = safeDeals.map((d) => {
    const sections: WorkbenchSectionKey[] = ['active'];

    const created = parseTime(d.createdOn);
    if (created !== undefined && nowMs - created <= RECENT_DAYS * MS_PER_DAY) {
      sections.push('recent');
    }

    const close = parseTime(d.targetCloseDate);
    if (close !== undefined && close >= nowMs && close - nowMs <= CLOSING_SOON_DAYS * MS_PER_DAY) {
      sections.push('closing');
    }

    const lastAct = parseTime(d.lastActivityOn);
    const stale = lastAct !== undefined && nowMs - lastAct >= STALE_DAYS * MS_PER_DAY;
    const pastClose = close !== undefined && close < nowMs;
    const overdueTask = hasOverdueTask(d.id, safeTasks, nowMs);
    if (stale || pastClose || overdueTask) {
      sections.push('attention');
    }

    return {
      id: d.id,
      name: d.name,
      borrower: d.clientName,
      stage: d.stage,
      status: d.status,
      amount: d.amount,
      owner,
      nextAction: nextActionFor(d.id, safeTasks),
      lastActivity: d.lastActivityOn,
      createdOn: d.createdOn,
      targetCloseDate: d.targetCloseDate,
      sections,
      isTestRecord: d.isTestRecord,
    };
  });

  // "Recently Created" is also ordered newest-first so a just-created deal
  // surfaces at the top of that section.
  const counts: Record<WorkbenchSectionKey, number> = {
    active: 0,
    recent: 0,
    closing: 0,
    attention: 0,
  };
  for (const r of rows) {
    // D-01 fix: a classified test/smoke record still belongs to its sections
    // (so section-browsing and search find it — see rowsForSection below and
    // the quick-search box in BankerLoanWorkflowWorkbench.tsx), but it is
    // excluded from the queue-card COUNT tallies so those numbers stay an
    // operational-only KPI, matching the banker dashboard's own convention.
    if (r.isTestRecord) continue;
    for (const sec of r.sections) counts[sec] += 1;
  }

  return { rows, counts };
}

/** Rows belonging to a section, ordered for that section's intent. */
export function rowsForSection(model: WorkbenchModel, key: WorkbenchSectionKey): readonly WorkbenchRow[] {
  const rows = model.rows.filter((r) => r.sections.includes(key));
  if (key === 'recent') {
    return rows.slice().sort((a, b) => (parseTime(b.createdOn) ?? 0) - (parseTime(a.createdOn) ?? 0));
  }
  if (key === 'closing') {
    return rows.slice().sort((a, b) => (parseTime(a.targetCloseDate) ?? 0) - (parseTime(b.targetCloseDate) ?? 0));
  }
  return rows;
}
