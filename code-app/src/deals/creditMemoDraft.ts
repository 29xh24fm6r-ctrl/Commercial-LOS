import type { DealDetail } from './dealQueries';
import type { DealTask, DealTasksResult } from './dealTaskQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData, CreditMemoSummary } from './creditMemoQueries';
import { deriveBlockers, type BlockerSignal } from './blockerRules';

/**
 * Phase 24: pure credit memo DRAFT generator. Produces an editable
 * text preview only — no Dataverse write, no AI call, no PDF, no
 * finalize. The banker copies the body manually for now.
 *
 * Schema note (verified against ../generated/services/):
 *   - cr664_creditmemo1 and cr664_creditmemodraftsection both exist
 *     as Dataverse entities, but Phase 24 is explicitly NOT a write
 *     phase. Persistence/versioning/export is deferred to a later
 *     governed-write phase with audit + timeline + stale-regeneration
 *     rules. We render those existing records as read-only metadata
 *     in the missing-info panel when relevant, but never modify them.
 *
 * Discipline:
 *   - No invented facts. Every section pulls only from authorized
 *     deal/tasks/documents/blockers/memos in ctx.
 *   - Missing fields render as "Missing / Not provided." in the body
 *     AND are returned in missingFields so the UI can surface them
 *     explicitly to the banker.
 *   - No commitment/recommendation language ("approved", "recommended",
 *     "cleared"). The "Recommended Next Steps" section reads as
 *     "Items to complete before final memo" — process steps, not
 *     credit-decision recommendations.
 *   - Output is internal/banker-facing — no borrower-safe constraints.
 */

export type CreditMemoSectionKey =
  | 'executive-summary'
  | 'borrower-overview'
  | 'loan-request'
  | 'collateral'
  | 'guarantor-support'
  | 'pricing-structure'
  | 'due-diligence-documents'
  | 'open-tasks-conditions'
  | 'risks-blockers'
  | 'recommended-next-steps';

export interface CreditMemoSectionOption {
  key: CreditMemoSectionKey;
  label: string;
}

export const SECTION_OPTIONS: readonly CreditMemoSectionOption[] = [
  { key: 'executive-summary', label: 'Executive Summary' },
  { key: 'borrower-overview', label: 'Borrower / Relationship Overview' },
  { key: 'loan-request', label: 'Loan Request' },
  { key: 'collateral', label: 'Collateral' },
  { key: 'guarantor-support', label: 'Guarantor Support' },
  { key: 'pricing-structure', label: 'Pricing / Structure' },
  { key: 'due-diligence-documents', label: 'Due Diligence / Documents' },
  { key: 'open-tasks-conditions', label: 'Open Tasks / Conditions' },
  { key: 'risks-blockers', label: 'Risks / Blockers' },
  { key: 'recommended-next-steps', label: 'Recommended Next Steps' },
];

export const ALL_SECTION_KEYS: readonly CreditMemoSectionKey[] = SECTION_OPTIONS.map(
  (o) => o.key,
);

export const MISSING_PLACEHOLDER = 'Missing / Not provided.';

export interface CreditMemoDraftContext {
  deal: DealDetail;
  tasks: DealTasksResult | undefined;
  documents: DealDocumentsResult | undefined;
  /** Existing credit memo metadata, used in the missing-info panel /
   *  header notice if any prior memos exist. Never modified. */
  existingMemos: CreditMemoData | undefined;
  now?: Date;
}

export interface CreditMemoDraftResult {
  body: string;
  /** Field-level gaps discovered while generating each section. Each
   *  entry is "Section label — field". Surfaced so the banker sees
   *  what the deal is missing, not just blank text. */
  missingFields: string[];
}

export function buildCreditMemoDraft(
  enabledSections: readonly CreditMemoSectionKey[],
  ctx: CreditMemoDraftContext,
): CreditMemoDraftResult {
  const now = ctx.now ?? new Date();
  const missing: string[] = [];
  const blocks: string[] = [];

  blocks.push(header(ctx, now));

  const enabledSet = new Set(enabledSections);
  for (const opt of SECTION_OPTIONS) {
    if (!enabledSet.has(opt.key)) continue;
    const section = renderSection(opt, ctx, now, missing);
    blocks.push(section);
  }

  blocks.push(footer());

  return { body: blocks.join('\n\n'), missingFields: missing };
}

function header(ctx: CreditMemoDraftContext, now: Date): string {
  const lines = [
    '# Credit Memo — DRAFT PREVIEW',
    '',
    'Draft preview — not saved, not final, banker review required.',
    `Generated locally on ${now.toISOString()}. No AI was used to produce this draft.`,
    '',
    `Deal: ${ctx.deal.name || MISSING_PLACEHOLDER}`,
    `Client: ${ctx.deal.clientName || MISSING_PLACEHOLDER}`,
    `Stage: ${ctx.deal.stage || MISSING_PLACEHOLDER}`,
    `Status: ${ctx.deal.status || MISSING_PLACEHOLDER}`,
    `Banker: ${ctx.deal.bankerName || MISSING_PLACEHOLDER}`,
  ];
  if (ctx.existingMemos && ctx.existingMemos.memos.length > 0) {
    lines.push('', `Prior memos on file: ${ctx.existingMemos.memos.length} (not modified by this draft).`);
  }
  return lines.join('\n');
}

function footer(): string {
  return [
    '---',
    'End of draft preview. Not saved to Dataverse. Not exported. Not finalized.',
  ].join('\n');
}

function renderSection(
  opt: CreditMemoSectionOption,
  ctx: CreditMemoDraftContext,
  now: Date,
  missing: string[],
): string {
  switch (opt.key) {
    case 'executive-summary':
      return execSummary(opt.label, ctx, missing);
    case 'borrower-overview':
      return borrowerOverview(opt.label, ctx, missing);
    case 'loan-request':
      return loanRequest(opt.label, ctx, missing);
    case 'collateral':
      return collateral(opt.label, ctx, missing);
    case 'guarantor-support':
      return guarantorSupport(opt.label, ctx, missing);
    case 'pricing-structure':
      return pricingStructure(opt.label, ctx, missing);
    case 'due-diligence-documents':
      return dueDiligenceDocs(opt.label, ctx, missing);
    case 'open-tasks-conditions':
      return openTasksConditions(opt.label, ctx, now, missing);
    case 'risks-blockers':
      return risksBlockers(opt.label, ctx, now);
    case 'recommended-next-steps':
      return nextSteps(opt.label, ctx, now);
  }
}

function execSummary(
  label: string,
  ctx: CreditMemoDraftContext,
  missing: string[],
): string {
  const facts: string[] = [];
  facts.push(`Deal name: ${valOrMissing(ctx.deal.name, label, 'Deal name', missing)}`);
  facts.push(`Client: ${valOrMissing(ctx.deal.clientName, label, 'Client', missing)}`);
  facts.push(`Requested amount: ${formatAmount(ctx.deal.amount) ?? trackMissing(label, 'Requested amount', missing)}`);
  facts.push(`Current stage: ${valOrMissing(ctx.deal.stage, label, 'Current stage', missing)}`);
  facts.push(`Target close: ${formatDate(ctx.deal.targetCloseDate) ?? trackMissing(label, 'Target close date', missing)}`);
  // Deliberately neutral framing — no recommendation/decision verbs,
  // and no words that the Phase-23 borrower-safe guard would flag
  // (e.g. "approval") so a saved draft never blocks on its own
  // disclaimer language.
  facts.push(
    '',
    'Summary: This memo summarizes the current state of the relationship and request based on the data captured on the deal record. It is not a credit decision and does not commit the bank to any outcome. Fields not yet captured are marked as Missing / Not provided.',
  );
  return sectionWrap(label, facts.join('\n'));
}

function borrowerOverview(
  label: string,
  ctx: CreditMemoDraftContext,
  missing: string[],
): string {
  const lines = [
    `Client name: ${valOrMissing(ctx.deal.clientName, label, 'Client name', missing)}`,
    `Industry: ${valOrMissing(ctx.deal.industry, label, 'Industry', missing)}`,
    `Customer type: ${valOrMissing(ctx.deal.customerType, label, 'Customer type', missing)}`,
    `Relationship banker: ${valOrMissing(ctx.deal.bankerName, label, 'Banker', missing)}`,
  ];
  return sectionWrap(label, lines.join('\n'));
}

function loanRequest(
  label: string,
  ctx: CreditMemoDraftContext,
  missing: string[],
): string {
  const lines = [
    `Requested amount: ${formatAmount(ctx.deal.amount) ?? trackMissing(label, 'Requested amount', missing)}`,
    `Product type: ${valOrMissing(ctx.deal.productType, label, 'Product type', missing)}`,
    `Loan structure: ${valOrMissing(ctx.deal.loanStructure, label, 'Loan structure', missing)}`,
    `Target close date: ${formatDate(ctx.deal.targetCloseDate) ?? trackMissing(label, 'Target close date', missing)}`,
  ];
  return sectionWrap(label, lines.join('\n'));
}

function collateral(
  label: string,
  ctx: CreditMemoDraftContext,
  missing: string[],
): string {
  const summary = ctx.deal.collateralSummary?.trim();
  if (!summary) {
    missing.push(`${label} — Collateral summary`);
    return sectionWrap(
      label,
      `Collateral summary: ${MISSING_PLACEHOLDER}\nDetailed collateral schedule has not been captured on this deal record.`,
    );
  }
  return sectionWrap(label, `Collateral summary: ${summary}`);
}

function guarantorSupport(
  label: string,
  ctx: CreditMemoDraftContext,
  missing: string[],
): string {
  const g = ctx.deal.guarantorStructure?.trim();
  if (!g) {
    missing.push(`${label} — Guarantor structure`);
    return sectionWrap(
      label,
      `Guarantor structure: ${MISSING_PLACEHOLDER}\nNo guarantor structure has been captured on this deal record.`,
    );
  }
  return sectionWrap(label, `Guarantor structure: ${g}`);
}

function pricingStructure(
  label: string,
  ctx: CreditMemoDraftContext,
  missing: string[],
): string {
  const lines = [
    `Pricing type: ${valOrMissing(ctx.deal.pricingType, label, 'Pricing type', missing)}`,
    `Spread index: ${valOrMissing(ctx.deal.spreadIndex, label, 'Spread index', missing)}`,
    `Spread margin (bps): ${
      ctx.deal.spreadMargin != null
        ? String(ctx.deal.spreadMargin)
        : trackMissing(label, 'Spread margin', missing)
    }`,
  ];
  return sectionWrap(label, lines.join('\n'));
}

function dueDiligenceDocs(
  label: string,
  ctx: CreditMemoDraftContext,
  missing: string[],
): string {
  if (!ctx.documents) {
    missing.push(`${label} — Document checklist not loaded`);
    return sectionWrap(
      label,
      `Document data not available at draft generation time. ${MISSING_PLACEHOLDER}`,
    );
  }
  const { outstanding, received, reviewed } = ctx.documents;
  const lines = [
    `Reviewed: ${reviewed.length}`,
    `Received (not yet reviewed): ${received.length}`,
    `Outstanding: ${outstanding.length}`,
  ];
  if (outstanding.length > 0) {
    lines.push('', 'Outstanding items:');
    lines.push(...outstanding.slice(0, 20).map((d) => `  - ${d.name}`));
  }
  if (received.length === 0 && reviewed.length === 0 && outstanding.length === 0) {
    // Informational, not a missing field. An empty checklist is the
    // deal's actual state — we don't pretend a field is unfilled.
    lines.push('', 'No documents are tracked on this deal yet.');
  }
  return sectionWrap(label, lines.join('\n'));
}

function openTasksConditions(
  label: string,
  ctx: CreditMemoDraftContext,
  now: Date,
  missing: string[],
): string {
  if (!ctx.tasks) {
    missing.push(`${label} — Task list not loaded`);
    return sectionWrap(
      label,
      `Task data not available at draft generation time. ${MISSING_PLACEHOLDER}`,
    );
  }
  const open = ctx.tasks.open;
  if (open.length === 0) {
    return sectionWrap(label, 'No open tasks on this deal.');
  }
  const overdue = open.filter((t) => isOverdue(t, now));
  const lines: string[] = [
    `Open tasks: ${open.length}${overdue.length > 0 ? ` (${overdue.length} overdue)` : ''}`,
    '',
  ];
  for (const t of open.slice(0, 20)) {
    const due = formatDate(t.dueDate) ?? 'no due date';
    const flag = isOverdue(t, now) ? ' [OVERDUE]' : '';
    lines.push(`  - ${t.title} (${due})${flag}`);
  }
  return sectionWrap(label, lines.join('\n'));
}

function risksBlockers(
  label: string,
  ctx: CreditMemoDraftContext,
  now: Date,
): string {
  const result = deriveBlockers(ctx.deal, ctx.tasks, ctx.documents, now);
  if (result.closedDealNote) {
    return sectionWrap(label, result.closedDealNote);
  }
  if (result.signals.length === 0) {
    return sectionWrap(
      label,
      'No blocking or at-risk signals detected from the current data. Banker review still required.',
    );
  }
  const lines: string[] = [`Overall status: ${result.status}`, ''];
  for (const s of result.signals) {
    lines.push(`  - [${severityTag(s)}] ${s.label}`);
    lines.push(`      ${s.detail}`);
  }
  return sectionWrap(label, lines.join('\n'));
}

function severityTag(s: BlockerSignal): string {
  if (s.severity === 'blocked') return 'BLOCKED';
  if (s.severity === 'at-risk') return 'AT RISK';
  return 'INFO';
}

function nextSteps(
  label: string,
  ctx: CreditMemoDraftContext,
  now: Date,
): string {
  // Process-oriented framing only. Never recommends a credit decision.
  const items: string[] = [];
  if (ctx.documents) {
    const overdueDocs = ctx.documents.outstanding.filter((d) =>
      d.dueDate ? new Date(d.dueDate).getTime() < now.getTime() : false,
    );
    if (overdueDocs.length > 0) {
      items.push(
        `Follow up on ${overdueDocs.length} overdue outstanding document${overdueDocs.length === 1 ? '' : 's'}.`,
      );
    } else if (ctx.documents.outstanding.length > 0) {
      items.push(
        `Continue collection of ${ctx.documents.outstanding.length} outstanding document${ctx.documents.outstanding.length === 1 ? '' : 's'}.`,
      );
    }
  }
  if (ctx.tasks) {
    const overdueTasks = ctx.tasks.open.filter((t) => isOverdue(t, now));
    if (overdueTasks.length > 0) {
      items.push(
        `Resolve ${overdueTasks.length} overdue open task${overdueTasks.length === 1 ? '' : 's'}.`,
      );
    } else if (ctx.tasks.open.length > 0) {
      items.push(
        `Work the ${ctx.tasks.open.length} remaining open task${ctx.tasks.open.length === 1 ? '' : 's'}.`,
      );
    }
  }
  if (!ctx.deal.collateralSummary) items.push('Capture collateral summary on the deal record.');
  if (!ctx.deal.guarantorStructure) items.push('Capture guarantor structure on the deal record.');
  if (ctx.deal.amount == null) items.push('Confirm requested loan amount.');
  if (!ctx.deal.targetCloseDate) items.push('Confirm target close date.');
  items.push(
    'Banker review of this draft before any submission or memo finalization.',
  );

  const lines = [
    'Items to complete before this draft becomes a final memo:',
    '',
    ...items.map((i, idx) => `  ${idx + 1}. ${i}`),
  ];
  return sectionWrap(label, lines.join('\n'));
}

function sectionWrap(label: string, body: string): string {
  return `## ${label}\n\n${body}`;
}

function valOrMissing(
  v: string | undefined,
  sectionLabel: string,
  fieldLabel: string,
  missing: string[],
): string {
  if (v && v.trim().length > 0) return v;
  return trackMissing(sectionLabel, fieldLabel, missing);
}

function trackMissing(
  sectionLabel: string,
  fieldLabel: string,
  missing: string[],
): string {
  missing.push(`${sectionLabel} — ${fieldLabel}`);
  return MISSING_PLACEHOLDER;
}

function formatAmount(n: number | undefined): string | undefined {
  if (n == null) return undefined;
  if (!Number.isFinite(n)) return undefined;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  // Force UTC so the rendered date matches the underlying ISO value —
  // a banker reading the memo sees the data's date, not their
  // local-timezone interpretation of a midnight-UTC timestamp.
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isOverdue(t: DealTask, now: Date): boolean {
  if (!t.dueDate) return false;
  const d = new Date(t.dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

// Re-exported for consumers that want to test or surface raw helpers
// without importing the full ./blockerRules surface area.
export type { DealTask, DealDocument, CreditMemoSummary };
