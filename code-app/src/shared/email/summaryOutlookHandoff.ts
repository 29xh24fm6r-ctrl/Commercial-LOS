/**
 * Phase 101: thin wrapper over the Phase 63 mailto / clipboard
 * primitives so the Phase 98 / 99 / 100 plain-text summaries can be
 * handed off to the banker's own Outlook client without any
 * connector-backed send, Graph call, or Dataverse write.
 *
 * Reuses the existing Phase 63 helpers verbatim:
 *   - `buildMailtoUrl({ recipient, subject, body })` — RFC 6068
 *     mailto URL.
 *   - `buildHandoffClipboardText({ recipient, subject, body })` —
 *     "To: …\nSubject: …\n\n<body>" clipboard fallback.
 *
 * This module does NOT duplicate the encoding logic or the
 * clipboard-text format. It only adds:
 *   - a small `prepareSummaryOutlookHandoff` wrapper that defaults
 *     the recipient to the empty string and returns both the
 *     mailto URL and the clipboard payload at once;
 *   - three banker-safe subject builders matching the Phase 101
 *     brief's verbatim subject lines.
 *
 * Phase 48 isolation: this module lives under src/shared/ and only
 * imports the Phase 63 helper module (also under src/deals/, which
 * is allowed as a non-role directory).
 *
 * What this is NOT:
 *   - Not an app-side email send. The banker sends from their own
 *     Outlook client. The output is a mailto URL + a clipboard
 *     payload; nothing leaves the page on its own.
 *   - Not a connector call. No Office 365 Outlook connector is
 *     registered or invoked. No Graph. No MSAL. No token.
 *   - Not a Dataverse write. No audit row, no timeline event, no
 *     governed-write entry.
 *   - Not a delivery surface. The app does not know whether the
 *     banker pastes / edits / sends.
 */

import {
  buildHandoffClipboardText,
  buildMailtoUrl,
} from '../../deals/emailDelivery/emailHandoff';

export interface SummaryOutlookHandoffInput {
  /** Optional recipient address. Phase 63 contract: the banker
   *  enters the recipient in their Outlook client; the app NEVER
   *  infers a recipient from client name or any other field. When
   *  omitted, the mailto URL leaves the `mailto:` prefix bare and
   *  the clipboard payload renders "To: " with no value. */
  recipient?: string | undefined;
  /** Single-line subject. Trimmed by `buildMailtoUrl` /
   *  `buildHandoffClipboardText` before use. */
  subject: string;
  /** Multi-line body (typically the output of one of the Phase
   *  98 / 99 / 100 plain-text formatters). Newlines are preserved
   *  in both the mailto URL (as `%0A`) and the clipboard payload
   *  (as `\n`). */
  body: string;
}

export interface SummaryOutlookHandoffPayload {
  /** `mailto:` URL the UI hands to `window.location.href`. */
  mailtoUrl: string;
  /** "To: …\nSubject: …\n\n<body>" string the UI writes to the
   *  clipboard as a fallback when mailto is blocked or not
   *  registered. */
  clipboardText: string;
}

/**
 * Build both the mailto URL and the clipboard payload for one
 * Outlook handoff in one call. Pure function; no side effects.
 */
export function prepareSummaryOutlookHandoff(
  input: SummaryOutlookHandoffInput,
): SummaryOutlookHandoffPayload {
  const content = {
    recipient: input.recipient ?? '',
    subject: input.subject,
    body: input.body,
  };
  return {
    mailtoUrl: buildMailtoUrl(content),
    clipboardText: buildHandoffClipboardText(content),
  };
}

// ---------------------------------------------------------------------------
// Subject builders
//
// Verbatim matches to the Phase 101 brief. Conservative — no IDs,
// no cr664_* logical names, no event types, no priority labels. The
// banker can edit the subject in Outlook before sending.
// ---------------------------------------------------------------------------

/** Subject for the Banker + Manager morning-catch-up handoff
 *  (Phase 98). Same on both surfaces — the brief explicitly says
 *  "Morning catch-up summary" without a banker/manager qualifier. */
export function morningCatchUpOutlookSubject(): string {
  return 'Morning catch-up summary';
}

/** Subject for the per-deal Activity Timeline handoff (Phase 99).
 *  When the deal name is blank, falls back to a generic subject
 *  rather than rendering "— " with a missing name. */
export function activityTimelineOutlookSubject(dealName: string): string {
  const name = dealName.trim();
  if (name.length === 0) return 'Deal activity summary';
  return `Deal activity summary — ${name}`;
}

/** Subject for the per-client Relationship Memory handoff (Phase
 *  100). When the client display name is missing on record, the
 *  subject swaps in the verbatim "(no borrower name on record)"
 *  placeholder rather than rendering a bare em dash. */
export function relationshipMemoryOutlookSubject(
  displayName: string,
  isClientNameMissing: boolean,
): string {
  if (isClientNameMissing) {
    return 'Relationship snapshot — (no borrower name on record)';
  }
  const name = displayName.trim();
  if (name.length === 0) {
    return 'Relationship snapshot — (no borrower name on record)';
  }
  return `Relationship snapshot — ${name}`;
}
