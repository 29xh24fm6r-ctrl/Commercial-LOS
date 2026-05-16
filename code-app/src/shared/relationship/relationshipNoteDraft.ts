/**
 * Phase 78: pure formatter for local-only banker relationship notes.
 *
 * Takes a small input shape (client name, banker name, the three
 * banker-typed text blocks, a list of deal pills, and a stable
 * `generatedAt`) and produces a plain-text formatted draft the
 * banker can copy into the bank's external system of record.
 *
 * Local-only by construction:
 *   - No SDK import. No role-module import. No clock outside the
 *     caller-supplied `generatedAt`.
 *   - This function does not write anything anywhere. The string it
 *     returns is exclusively for the banker to copy to their
 *     clipboard.
 *
 * Conservative copy discipline (Phase 78 brief):
 *   - The trailing disclaimer uses "Local draft. Not saved to the
 *     system. Paste into the appropriate system of record." verbatim.
 *   - The formatter NEVER prints "saved", "logged", "recorded",
 *     "persisted", "relationship memory updated", "synced",
 *     "AI-generated", or "official record". The static-source
 *     hygiene test in relationshipNoteDraft.test.ts pins this.
 */

export interface RelationshipNoteDealRef {
  /** Display name as shown on the relationship card. */
  dealName: string;
  /** Current stage label (free-text). Optional. */
  stage: string | undefined;
}

export interface RelationshipNoteDraftInput {
  /** Display name of the client this note describes. Trim before
   *  passing — the formatter does not trim. */
  clientName: string;
  /** Banker's display name. Optional; if absent the "Prepared by"
   *  line is omitted rather than fabricated. */
  bankerName: string | undefined;
  /** Banker-typed note text. Trimmed by the formatter. Required for
   *  the function to produce a useful draft — if blank, the body
   *  surfaces a placeholder line so the formatted output is still
   *  copy-able and self-describing. */
  noteText: string;
  /** Optional banker-typed follow-up reminder. Trimmed. Omitted if
   *  blank. */
  followUpText?: string | undefined;
  /** Optional banker-typed open-ask / next-step text. Trimmed.
   *  Omitted if blank. */
  openAskText?: string | undefined;
  /** Per-deal pills carried by the client at the time the note was
   *  prepared. Rendered as a short bulleted list. Empty array
   *  produces no "Active deals" block. */
  deals: ReadonlyArray<RelationshipNoteDealRef>;
  /** Caller-supplied "now". Rendered in ISO-day form so the string
   *  is deterministic and easy to read. */
  generatedAt: Date;
}

export const LOCAL_DRAFT_FOOTER =
  '— Local draft. Not saved to the system. Paste into the ' +
  'appropriate system of record.';

export function buildRelationshipNoteText(
  input: RelationshipNoteDraftInput,
): string {
  const lines: string[] = [];

  const heading = `Relationship note — ${input.clientName}`.trim();
  lines.push(heading);

  const dateLine = formatPreparedLine(input.generatedAt, input.bankerName);
  if (dateLine) lines.push(dateLine);

  lines.push('');

  if (input.deals.length > 0) {
    lines.push('Active deals:');
    for (const d of input.deals) {
      lines.push(`- ${d.dealName}${d.stage ? ` (${d.stage})` : ''}`);
    }
    lines.push('');
  }

  const trimmedNote = (input.noteText ?? '').trim();
  lines.push('Note:');
  lines.push(
    trimmedNote.length > 0
      ? trimmedNote
      : '(banker note — fill in before copying)',
  );
  lines.push('');

  const trimmedFollow = (input.followUpText ?? '').trim();
  if (trimmedFollow.length > 0) {
    lines.push('Follow-up:');
    lines.push(trimmedFollow);
    lines.push('');
  }

  const trimmedAsks = (input.openAskText ?? '').trim();
  if (trimmedAsks.length > 0) {
    lines.push('Open asks / next steps:');
    lines.push(trimmedAsks);
    lines.push('');
  }

  lines.push(LOCAL_DRAFT_FOOTER);

  return lines.join('\n');
}

function formatPreparedLine(
  generatedAt: Date,
  bankerName: string | undefined,
): string {
  const iso = isoDay(generatedAt);
  if (!iso) return '';
  const who = bankerName?.trim();
  return who ? `Prepared ${iso} by ${who}` : `Prepared ${iso}`;
}

function isoDay(d: Date): string | undefined {
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return undefined;
  // YYYY-MM-DD in UTC. Deterministic, locale-free.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
