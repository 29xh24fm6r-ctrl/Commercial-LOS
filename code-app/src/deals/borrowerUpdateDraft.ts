import type { DealDetail } from './dealQueries';
import type { DealDocument } from './dealDocumentQueries';
import type { DealTask } from './dealTaskQueries';

/**
 * Phase 23: borrower update DRAFT generation. No write, no send, no
 * Outlook/Graph. Pure function: takes the already-authorized deal
 * context (deal, outstanding documents, open tasks) and returns a
 * borrower-safe subject + body for the banker to copy manually.
 *
 * Schema note (verified against ../generated/services and
 * ../generated/models/Cr664_dealtimelineeventsModel.ts):
 *   - No draft/email/communication entity exists in the generated
 *     services. cr664_borrower has name only, no email column.
 *   - DealTimelineEvent's eventtype enum has BorrowerUpdateSent
 *     (788190014) but NO BorrowerUpdateDrafted value. Per the phase-23
 *     guardrail we MUST NOT emit BorrowerUpdateSent unless the message
 *     was actually sent — and we explicitly do not send anything here.
 *   - Therefore Phase 23 is the local-only fallback path: generate
 *     text in-modal, Copy to clipboard, no Dataverse write. The modal
 *     must label this clearly ("Draft not saved to system.").
 */

export type BorrowerUpdateTemplate =
  | 'general-status'
  | 'missing-documents'
  | 'underwriting-update'
  | 'closing-progress';

export interface BorrowerUpdateTemplateOption {
  key: BorrowerUpdateTemplate;
  label: string;
  description: string;
}

export const TEMPLATE_OPTIONS: readonly BorrowerUpdateTemplateOption[] = [
  {
    key: 'general-status',
    label: 'General Status Update',
    description: 'A neutral progress update with current stage and next steps.',
  },
  {
    key: 'missing-documents',
    label: 'Missing Documents Reminder',
    description: 'Lists outstanding documents so the borrower can return them.',
  },
  {
    key: 'underwriting-update',
    label: 'Underwriting Update',
    description: 'Notes that underwriting review is in progress, no decision.',
  },
  {
    key: 'closing-progress',
    label: 'Closing Progress Update',
    description: 'Closing milestones and next actions; no clear-to-close language.',
  },
];

export interface DraftContext {
  deal: DealDetail;
  outstandingDocuments: DealDocument[];
  openTasks: DealTask[];
  bankerName: string | undefined;
}

export interface BorrowerUpdateDraft {
  subject: string;
  body: string;
}

/**
 * Pure draft generator. Borrower-safe by construction: NEVER emits
 * commitment language like "approved", "guaranteed", or "cleared to
 * close" — the templates use status-neutral phrasing only. If the
 * banker later edits the body, validateBorrowerSafe() should be
 * re-run against the edited text before Copy.
 */
export function buildBorrowerUpdateDraft(
  template: BorrowerUpdateTemplate,
  ctx: DraftContext,
): BorrowerUpdateDraft {
  const dealName = ctx.deal.name || 'your loan';
  const stage = ctx.deal.stage ?? 'in progress';
  const greeting = `Hi ${ctx.deal.clientName ?? 'there'},`;
  const sign = bankerSignoff(ctx.bankerName);

  switch (template) {
    case 'general-status':
      return {
        subject: `Status update on ${dealName}`,
        body: [
          greeting,
          '',
          `I wanted to share a brief update on ${dealName}. We are currently in the ${stage} stage.`,
          '',
          nextStepsBlock(ctx),
          '',
          'Please let me know if you have any questions.',
          '',
          sign,
        ].join('\n'),
      };
    case 'missing-documents':
      return {
        subject: `Documents we still need for ${dealName}`,
        body: [
          greeting,
          '',
          `We are working through ${dealName} and there are a few documents still outstanding on our end:`,
          '',
          outstandingDocumentsBlock(ctx.outstandingDocuments),
          '',
          'Sending these along when you are able will help us keep things moving.',
          '',
          sign,
        ].join('\n'),
      };
    case 'underwriting-update':
      return {
        subject: `Underwriting update on ${dealName}`,
        body: [
          greeting,
          '',
          `A quick update on ${dealName}. Underwriting is reviewing the file. We are in the ${stage} stage and have not made any final decisions yet.`,
          '',
          nextStepsBlock(ctx),
          '',
          'I will reach out as soon as I have more to share.',
          '',
          sign,
        ].join('\n'),
      };
    case 'closing-progress':
      return {
        subject: `Closing progress on ${dealName}`,
        body: [
          greeting,
          '',
          `Here is where we stand on ${dealName}. Current stage: ${stage}.`,
          '',
          nextStepsBlock(ctx),
          '',
          // Deliberately status-neutral: never says "cleared to close".
          'I will keep you posted as we hit each milestone.',
          '',
          sign,
        ].join('\n'),
      };
  }
}

function nextStepsBlock(ctx: DraftContext): string {
  const lines: string[] = [];
  if (ctx.outstandingDocuments.length > 0) {
    lines.push(
      `Outstanding documents (${ctx.outstandingDocuments.length}):`,
      ...ctx.outstandingDocuments.slice(0, 10).map((d) => `  - ${d.name}`),
    );
  }
  const overdueOrOpen = ctx.openTasks.filter((t) => !t.completed);
  if (overdueOrOpen.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(
      `Open items on our side (${overdueOrOpen.length}):`,
      ...overdueOrOpen.slice(0, 5).map((t) => `  - ${t.title}`),
    );
  }
  if (lines.length === 0) {
    return 'There are no outstanding items from our side at the moment.';
  }
  return lines.join('\n');
}

function outstandingDocumentsBlock(docs: DealDocument[]): string {
  if (docs.length === 0) {
    return 'Actually — our records show nothing outstanding at the moment. Please disregard if you have already sent everything over.';
  }
  return docs.map((d) => `  - ${d.name}`).join('\n');
}

function bankerSignoff(name: string | undefined): string {
  if (!name || name.trim().length === 0) return 'Thank you,';
  return `Thank you,\n${name}`;
}

/**
 * Borrower-safe content guard. Returns the list of prohibited terms
 * found in the candidate text. Commitment language is permitted only
 * when the deal's stage/status explicitly supports it (e.g. "approved"
 * is fine on a deal whose status name contains "Approved"; "closed"
 * variants are fine on a deal whose stage/status contains "Closed").
 *
 * This is a defensive guard against the banker editing in language the
 * deal can't back up. Templates themselves never include any of these
 * terms — the guard exists for post-edit validation, not generation.
 */
export interface ProhibitedTermHit {
  term: string;
  reason: string;
}

const COMMITMENT_TERMS: { term: string; pattern: RegExp; supportedBy: 'approved' | 'closed' }[] = [
  { term: 'approved', pattern: /\bapproved\b/i, supportedBy: 'approved' },
  { term: 'approval', pattern: /\bapproval\b/i, supportedBy: 'approved' },
  { term: 'guaranteed', pattern: /\bguaranteed?\b/i, supportedBy: 'approved' },
  { term: 'guarantee', pattern: /\bguarantee\b/i, supportedBy: 'approved' },
  { term: 'cleared to close', pattern: /\bcleared\s+to\s+close\b/i, supportedBy: 'closed' },
  { term: 'clear to close', pattern: /\bclear\s+to\s+close\b/i, supportedBy: 'closed' },
];

export function findProhibitedTerms(
  text: string,
  deal: DealDetail,
): ProhibitedTermHit[] {
  const stageStatus = `${deal.stage ?? ''} ${deal.status ?? ''}`.toLowerCase();
  const hits: ProhibitedTermHit[] = [];
  for (const t of COMMITMENT_TERMS) {
    if (!t.pattern.test(text)) continue;
    const supported =
      t.supportedBy === 'approved'
        ? /approved/.test(stageStatus)
        : /closed/.test(stageStatus) || /closing/.test(stageStatus);
    if (supported) continue;
    hits.push({
      term: t.term,
      reason: `Deal stage/status does not currently support the term "${t.term}".`,
    });
  }
  return hits;
}
