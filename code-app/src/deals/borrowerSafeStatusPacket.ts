import type { DealDetail } from './dealQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';

/**
 * Phase 66: borrower-safe status packet generator.
 *
 * Pure function. No Dataverse write, no network, no SDK import, no
 * clock outside of the caller-supplied `now` parameter (the modal
 * passes `new Date()` at click time; tests inject a fixed value).
 *
 * The packet is a banker-facing artifact the banker copies and
 * sends through the Phase 63 Outlook handoff (or any other personal
 * channel). It is NOT a portal, NOT a notification, NOT a write.
 *
 * What this generator reads:
 *   - DealDetail name + clientName + targetCloseDate + stage
 *   - DealDocumentsResult outstanding / received / reviewed lists
 *
 * What this generator DOES NOT read (deliberately, per the Phase 66
 * exclusion list):
 *   - alerts / data-quality flags
 *   - credit memo data
 *   - profitability metrics
 *   - audit ledger
 *   - internal task assignments
 *   - risk commentary / collateral notes / pricing margin
 *   - underwriting conclusions / approval status
 *
 * The bank-internal columns on DealDetail (collateralSummary,
 * spreadMargin, productType, etc.) ARE available in the context but
 * are NEVER read by this generator. The Phase 66 tests pin that
 * exclusion at the static-source level.
 *
 * Conservative copy:
 *   - No "approved", "denied", "cleared", "accepted", "validated",
 *     "final", "portal", "secure message", "uploaded by borrower".
 *   - The phrase "under bank review" is the safe replacement for
 *     "approved / reviewed by underwriting"; the borrower never
 *     receives a decision from this artifact.
 */

export interface BorrowerSafeStatusPacket {
  subject: string;
  body: string;
}

export interface BorrowerSafeStatusPacketContext {
  deal: DealDetail;
  documents: DealDocumentsResult;
  bankerName: string | undefined;
  /** Wall-clock at packet generation time. Caller-supplied so tests
   *  can pin formatting; the modal passes `new Date()`. */
  now: Date;
}

// Cap the list lengths. The packet is meant to be readable in an
// email body; pages-long checklists belong in a separate workflow.
const MAX_ITEMS_PER_SECTION = 25;

export function buildBorrowerSafeStatusPacket(
  ctx: BorrowerSafeStatusPacketContext,
): BorrowerSafeStatusPacket {
  const dealName = (ctx.deal.name && ctx.deal.name.trim()) || 'your loan';
  const greeting = greetingLine(ctx.deal.clientName);
  const signoff = bankerSignoff(ctx.bankerName);
  const dateLine = formatPacketDate(ctx.now);

  const requested = ctx.documents.outstanding;
  const received = ctx.documents.received;
  const reviewed = ctx.documents.reviewed;

  const sections: string[] = [
    greeting,
    '',
    `Below is a borrower-safe summary of where things stand on ${dealName}.`,
    `Last updated: ${dateLine}.`,
    '',
    formatRequestedSection(requested),
    '',
    formatReceivedSection(received),
    '',
    formatUnderReviewSection(reviewed),
    '',
    formatNextActionsSection(requested),
    '',
    DISCLAIMER_LINE,
    '',
    signoff,
  ];

  return {
    subject: `Status update — ${dealName}`,
    body: sections.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function formatRequestedSection(docs: readonly DealDocument[]): string {
  const header = `Items requested (${docs.length}):`;
  if (docs.length === 0) {
    return [header, '  No outstanding items at this time.'].join('\n');
  }
  const lines = docs.slice(0, MAX_ITEMS_PER_SECTION).map(formatRequestedItem);
  const omitted = docs.length - lines.length;
  if (omitted > 0) {
    lines.push(`  …and ${omitted} more. Please ask your banker for the full list.`);
  }
  return [header, ...lines].join('\n');
}

function formatRequestedItem(d: DealDocument): string {
  const parts: string[] = [`  - ${d.name}`];
  const due = formatDateShort(d.dueDate);
  if (due) parts.push(`(due ${due})`);
  const requested = formatDateShort(d.requestDate);
  if (requested) parts.push(`— requested on ${requested}`);
  return parts.join(' ');
}

function formatReceivedSection(docs: readonly DealDocument[]): string {
  const header = `Items received (${docs.length}):`;
  if (docs.length === 0) {
    return [header, '  Nothing received yet.'].join('\n');
  }
  const lines = docs.slice(0, MAX_ITEMS_PER_SECTION).map((d) => {
    const received = formatDateShort(d.receivedDate);
    return received
      ? `  - ${d.name} — received on ${received}`
      : `  - ${d.name}`;
  });
  const omitted = docs.length - lines.length;
  if (omitted > 0) {
    lines.push(`  …and ${omitted} more.`);
  }
  return [header, ...lines].join('\n');
}

function formatUnderReviewSection(docs: readonly DealDocument[]): string {
  const header = `Items under bank review (${docs.length}):`;
  if (docs.length === 0) {
    return [header, '  Nothing under review at this time.'].join('\n');
  }
  const lines = docs.slice(0, MAX_ITEMS_PER_SECTION).map((d) => `  - ${d.name}`);
  const omitted = docs.length - lines.length;
  if (omitted > 0) {
    lines.push(`  …and ${omitted} more.`);
  }
  return [header, ...lines].join('\n');
}

function formatNextActionsSection(outstanding: readonly DealDocument[]): string {
  const header = 'Next requested actions:';
  if (outstanding.length === 0) {
    return [header, '  No items requested at this time.'].join('\n');
  }
  const names = outstanding
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((d) => `  - Please send: ${d.name}`);
  return [header, ...names].join('\n');
}

// ---------------------------------------------------------------------------
// Boilerplate
// ---------------------------------------------------------------------------

// Disclaimer wording follows the Phase 66 conservative-copy rules:
// avoids "final", "decision", "approved", "denied", "cleared",
// "accepted", "validated". "Working summary" is the safe framing.
const DISCLAIMER_LINE =
  'This is a working summary from our records. It does not represent ' +
  'a decision on your loan; please confirm details with your banker ' +
  'before relying on this for any next step.';

function greetingLine(clientName: string | undefined): string {
  const name = clientName?.trim();
  if (!name) return 'Hi there,';
  return `Hi ${name},`;
}

function bankerSignoff(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return 'Thank you,';
  return `Thank you,\n${trimmed}`;
}

function formatPacketDate(now: Date): string {
  if (Number.isNaN(now.getTime())) return 'today';
  return now.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateShort(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
