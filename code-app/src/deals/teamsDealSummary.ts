/**
 * Phase 96: pure formatter for the local-only Teams deal-summary
 * handoff.
 *
 * Takes a small input shape — deal facts already loaded by
 * DealDataProvider plus a few derived counts the caller computed
 * from useDealData() — and produces a plain-text formatted summary
 * the banker can copy into Microsoft Teams (any chat or channel).
 *
 * Local-only by construction:
 *   - No SDK import. No role-module import. No Graph / MSAL / token
 *     code. The function returns a string; the caller copies it.
 *   - The function does not write anything anywhere. The text is
 *     exclusively for the banker to paste into a Teams composer.
 *   - The function does not "send" or "post" anything. The verbs
 *     "sent", "posted", "delivered", "notified", "synced",
 *     "integrated", and "Graph connected" never appear in the
 *     output. A static-source hygiene test pins this.
 *
 * Conservative copy discipline (Phase 96 brief):
 *   - The trailing disclaimer uses verbatim language stating that
 *     the summary is local, that the banker pastes it into Teams
 *     manually, and that the banker sends the message — the app
 *     does not.
 *   - The formatter NEVER prints internal audit IDs, raw timeline
 *     payloads, full credit memo text, approval / denial language,
 *     or borrower-sensitive private fields. The caller is expected
 *     to pass derived counts, NOT raw entity records.
 */

export interface TeamsDealSummaryTopSuggestion {
  /** Short title of the top Next Best Action — matches the Phase 80
   *  `NextBestAction.title` shape. */
  title: string;
  /** One-sentence explanation. */
  reason: string;
}

export interface TeamsDealSummaryInput {
  /** Deal facts — projected from the authorized cr664_loandeal
   *  record. The caller is expected to pass display-safe strings
   *  only (never IDs, never raw timeline JSON). */
  dealName: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  targetCloseDate: string | undefined;

  /** Counts already derived by the caller from useDealData().
   *  Negative inputs are clamped to 0 by the formatter so a buggy
   *  caller never produces a misleading negative count line. */
  openTaskCount: number;
  outstandingDocumentCount: number;
  pendingReviewDocumentCount: number;
  memoConsistencyFindingCount: number;

  /** Optional top Next Best Action from the Phase 80 derivation.
   *  When omitted the "Next best action" block is omitted entirely
   *  rather than fabricated. */
  topSuggestion: TeamsDealSummaryTopSuggestion | undefined;

  /** Banker's display name. Optional; if absent the "Prepared by"
   *  line uses "the assigned banker" rather than fabricating a name. */
  bankerName: string | undefined;

  /** Optional one-line relationship context note (e.g. "Borrower
   *  has N other deals in your pipeline"). When omitted the
   *  "Relationship" block is omitted entirely. */
  relationshipContextNote: string | undefined;

  /** Caller-supplied "now". Rendered as a YYYY-MM-DD UTC day so the
   *  string is deterministic and easy to read. */
  generatedAt: Date;
}

/** Closing-soon window — same threshold the Phase 80 autopilot uses
 *  for its `closing-soon` signal. Documented in
 *  src/shared/analytics/derivedAnalytics.ts as CLOSING_SOON_DAYS. */
export const TEAMS_DEAL_SUMMARY_CLOSING_SOON_DAYS = 14;

export const TEAMS_DEAL_SUMMARY_DISCLAIMER =
  '— Local copy only. Not posted to Teams. Paste into Teams. ' +
  'You send the message manually.';

export function buildTeamsDealSummary(input: TeamsDealSummaryInput): string {
  const lines: string[] = [];

  const heading = `Deal summary — ${input.dealName.trim()}`;
  lines.push(heading);
  lines.push('');

  // ----- Deal facts block ---------------------------------------
  pushKv(lines, 'Client', input.clientName);
  pushKv(lines, 'Stage', input.stage);
  pushKv(lines, 'Status', input.status);
  pushKv(lines, 'Loan amount', formatAmount(input.amount));
  pushKv(lines, 'Target close', formatDayUtc(input.targetCloseDate));
  lines.push('');

  // ----- Counts block (always rendered so the banker can see
  // "all zeros" honestly rather than implying nothing is going on). -
  const openTasks = clampCount(input.openTaskCount);
  const outstandingDocs = clampCount(input.outstandingDocumentCount);
  const pendingReviewDocs = clampCount(input.pendingReviewDocumentCount);
  const memoFindings = clampCount(input.memoConsistencyFindingCount);

  lines.push('Banker focus:');
  lines.push(`- Open tasks: ${openTasks}`);
  lines.push(`- Outstanding documents: ${outstandingDocs}`);
  lines.push(`- Documents pending review: ${pendingReviewDocs}`);
  lines.push(`- Memo consistency findings: ${memoFindings}`);
  lines.push('');

  // ----- Optional Next Best Action block ------------------------
  if (input.topSuggestion) {
    const title = input.topSuggestion.title.trim();
    const reason = input.topSuggestion.reason.trim();
    if (title.length > 0 || reason.length > 0) {
      lines.push('Next best action:');
      if (title.length > 0 && reason.length > 0) {
        lines.push(`- ${title} — ${reason}`);
      } else {
        lines.push(`- ${title || reason}`);
      }
      lines.push('');
    }
  }

  // ----- Closing-soon / stage-attention note --------------------
  const closingNote = buildClosingNote(
    input.targetCloseDate,
    input.generatedAt,
  );
  if (closingNote) {
    lines.push(closingNote);
    lines.push('');
  }

  // ----- Optional relationship context line ---------------------
  const relationshipNote = (input.relationshipContextNote ?? '').trim();
  if (relationshipNote.length > 0) {
    lines.push(`Relationship: ${relationshipNote}`);
    lines.push('');
  }

  // ----- Prepared-by line + verbatim disclaimer -----------------
  lines.push(formatPreparedLine(input.generatedAt, input.bankerName));
  lines.push('');
  lines.push(TEAMS_DEAL_SUMMARY_DISCLAIMER);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pushKv(
  lines: string[],
  label: string,
  value: string | undefined,
): void {
  if (!value) {
    lines.push(`${label}: Not provided`);
    return;
  }
  const trimmed = value.trim();
  lines.push(`${label}: ${trimmed.length > 0 ? trimmed : 'Not provided'}`);
}

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  return Math.floor(n);
}

function formatAmount(amount: number | undefined): string | undefined {
  if (amount == null || !Number.isFinite(amount)) return undefined;
  // Use a stable USD format without locale-dependent surprises in
  // tests. The deal model carries cr664_amount as a number so a
  // simple thousands separator is enough.
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(Math.round(amount));
  const withSeparators = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${withSeparators}`;
}

function formatDayUtc(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildClosingNote(
  targetCloseIso: string | undefined,
  generatedAt: Date,
): string | undefined {
  if (!targetCloseIso) return undefined;
  const close = new Date(targetCloseIso);
  if (Number.isNaN(close.getTime())) return undefined;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((close.getTime() - generatedAt.getTime()) / msPerDay);
  if (diffDays < 0) {
    const overdue = Math.abs(diffDays);
    return `Target close was ${formatDayCount(overdue)} ago. Needs attention.`;
  }
  if (diffDays <= TEAMS_DEAL_SUMMARY_CLOSING_SOON_DAYS) {
    if (diffDays === 0) return 'Target close is today. Closing soon.';
    return `Target close in ${formatDayCount(diffDays)}. Closing soon.`;
  }
  return undefined;
}

function formatDayCount(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

function formatPreparedLine(
  generatedAt: Date,
  bankerName: string | undefined,
): string {
  const day = formatDayUtc(generatedAt.toISOString()) ?? '';
  const who = (bankerName ?? '').trim() || 'the assigned banker';
  return day.length > 0
    ? `Prepared by ${who} on ${day}.`
    : `Prepared by ${who}.`;
}
