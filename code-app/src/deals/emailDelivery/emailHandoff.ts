/**
 * Phase 63: pure helpers for the no-admin email handoff path.
 *
 * The HANDOFF path does NOT send email from the app. Instead, the
 * banker initiates the send from their own Outlook client:
 *
 *   - "Open in Outlook" launches a `mailto:` URL that the OS hands
 *     to the banker's default mail client (Outlook on a typical bank
 *     workstation).
 *   - "Copy email" copies a plain-text composition (To / Subject /
 *     blank line / Body) to the clipboard as a fallback for cases
 *     where the mailto handler is blocked or not registered.
 *
 * Neither helper writes to Dataverse, neither calls a network API,
 * neither imports the @microsoft/power-apps SDK. They are pure data
 * shapers and exist entirely so the calling UI does not need to
 * know about RFC 6068 encoding edge cases or the exact clipboard
 * text format the audit/timeline pair will reference.
 *
 * Discipline:
 *   - Pure functions; no I/O, no clock, no module-level state.
 *   - The action layer (`prepareDocumentRequestHandoff`) records the
 *     handoff as a governed write AFTER the UI invokes one of these
 *     helpers. This file does not call the action and does not log.
 *   - We do NOT mask the recipient here. The handoff content IS the
 *     recipient address (the banker must see and edit it). Masking
 *     happens on the audit/timeline + outcome surfaces.
 */

export interface EmailHandoffContent {
  /** Full recipient address. The banker typed it; it will appear in
   *  the mailto URL and clipboard text verbatim. */
  recipient: string;
  /** Single-line subject. Trimmed by the helpers. */
  subject: string;
  /** Multi-line body. Newlines are preserved in both the mailto URL
   *  (encoded as %0A) and the clipboard text (preserved as LF). */
  body: string;
}

/**
 * Builds a `mailto:` URL that conforms to RFC 6068.
 *
 * Encoding rules:
 *   - The recipient is `encodeURIComponent`'d to handle the rare
 *     case of an address containing a `?` or `#` (technically valid
 *     in the local-part though uncommon).
 *   - Subject and body are encoded with `encodeURIComponent`. This
 *     correctly encodes newlines as `%0A` (Outlook + every modern
 *     mail client interprets that as a line break in the compose
 *     window).
 *   - The two query-string fields are joined with `&`. There is no
 *     `?` in the recipient field — the body/subject separator is
 *     always the first `?` after `mailto:<recipient>`.
 *
 * The helper does NOT enforce a body or subject length cap. Long
 * URLs can break some clients' mailto handlers; if the body exceeds
 * ~2,000 characters, the clipboard fallback is the safer path. The
 * modal surfaces both so the banker can choose.
 */
export function buildMailtoUrl(content: EmailHandoffContent): string {
  const recipient = encodeURIComponent(content.recipient.trim());
  const subject = encodeURIComponent(content.subject.trim());
  const body = encodeURIComponent(content.body);
  return `mailto:${recipient}?subject=${subject}&body=${body}`;
}

/**
 * Builds the plain-text representation the "Copy email" button
 * places on the clipboard. Format:
 *
 *   To: <recipient>
 *   Subject: <subject>
 *
 *   <body>
 *
 * Blank line between the headers and the body matches the
 * convention bankers expect when pasting into Outlook's compose
 * window. Trailing newlines from the body are preserved; we do not
 * trim the body because line breaks inside it are semantic.
 */
export function buildHandoffClipboardText(
  content: EmailHandoffContent,
): string {
  const recipient = content.recipient.trim();
  const subject = content.subject.trim();
  return `To: ${recipient}\nSubject: ${subject}\n\n${content.body}`;
}
