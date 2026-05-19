/**
 * Phase 97: pure formatter that turns a Phase 76/77
 * `CrossDealContextResult` into the optional one-line relationship
 * context note the Phase 96 Teams deal-summary handoff threads into
 * its `relationshipContextNote` slot.
 *
 * Reuse, not redefine:
 *   - The relationship derivation itself stays in
 *     `relationshipMemory.ts` (Phase 76/77). This module ONLY decides
 *     how to render a single, banker-safe one-liner from the existing
 *     `RelationshipMemoryEntry` aggregate.
 *   - Limitations carried by the derivation (client-name grouped; may
 *     not include all related borrowers; not a relationship graph) are
 *     stated verbatim in the rendered note.
 *
 * Output discipline:
 *   - Returns `undefined` when there is no useful content (no client
 *     name on record OR no other visible deals). The Phase 96
 *     formatter then omits the entire "Relationship: " line. Preferred
 *     posture per the Phase 97 brief.
 *   - Returns a short plain-text string when other visible deals exist
 *     under the same client-name group.
 *   - NEVER prints "household", "verified", "complete", "full
 *     relationship profile", "AI-generated", "relationship score",
 *     "risk score", "all borrower exposure", or any equivalent — a
 *     source-hygiene test pins this list.
 *
 * No write. No SDK import. No role-module import. No Graph / MSAL.
 */

import type { CrossDealContextResult } from './relationshipMemory';

export interface RelationshipContextNoteOptions {
  /** Caller-supplied "now" used for the nearest-upcoming-close date
   *  formatting. The formatter renders the date as YYYY-MM-DD UTC
   *  for determinism — same approach the Phase 96 summary uses for
   *  Target close. */
  now: Date;
}

/**
 * Render the relationship context note for the Phase 96 Teams summary,
 * or return `undefined` when there is no useful content to surface.
 */
export function buildRelationshipContextNote(
  result: CrossDealContextResult,
  _options: RelationshipContextNoteOptions,
): string | undefined {
  // Brief preference: omit when empty (no clutter in the Teams paste).
  if (result.kind === 'no-client-name') return undefined;
  if (result.kind === 'no-other-deals') return undefined;

  const { entry } = result;
  if (entry.activeDealCount <= 0) return undefined;

  const parts: string[] = [];

  // Sentence 1 — count + display name. Display name MAY be empty
  // (the "missing-name" group); the derivation's
  // `isClientNameMissing` flag tells us when to swap in a safe
  // placeholder rather than printing a bare colon.
  const dealsWord = entry.activeDealCount === 1 ? 'deal' : 'deals';
  const display = entry.isClientNameMissing
    ? '(no borrower name on record)'
    : entry.clientNameDisplay.trim();
  if (display.length > 0) {
    parts.push(
      `${entry.activeDealCount} other visible ${dealsWord} for ${display} ` +
        `(client-name grouped).`,
    );
  } else {
    parts.push(
      `${entry.activeDealCount} other visible ${dealsWord} (client-name grouped).`,
    );
  }

  // Sentence 2 — attention counts across the OTHER deals. Skip
  // counts that are zero so the line stays short and honest. Skip
  // the whole sentence when every count is zero.
  const askParts: string[] = [];
  if (entry.openTaskCount > 0) {
    const taskWord = entry.openTaskCount === 1 ? 'open task' : 'open tasks';
    if (entry.overdueTaskCount > 0) {
      askParts.push(
        `${entry.openTaskCount} ${taskWord} (${entry.overdueTaskCount} overdue)`,
      );
    } else {
      askParts.push(`${entry.openTaskCount} ${taskWord}`);
    }
  }
  if (entry.outstandingDocumentCount > 0) {
    const docWord =
      entry.outstandingDocumentCount === 1
        ? 'outstanding document'
        : 'outstanding documents';
    askParts.push(`${entry.outstandingDocumentCount} ${docWord}`);
  }
  if (entry.pendingReviewDocumentCount > 0) {
    const reviewWord =
      entry.pendingReviewDocumentCount === 1
        ? 'document pending review'
        : 'documents pending review';
    askParts.push(`${entry.pendingReviewDocumentCount} ${reviewWord}`);
  }
  if (entry.draftMemoCount > 0) {
    const memoWord = entry.draftMemoCount === 1 ? 'draft memo' : 'draft memos';
    askParts.push(`${entry.draftMemoCount} ${memoWord}`);
  }
  if (askParts.length > 0) {
    parts.push(`Across those deals: ${joinAsks(askParts)}.`);
  }

  // Sentence 3 — nearest upcoming close, if any. Rendered as YYYY-MM-DD
  // UTC to match the Phase 96 summary's date format.
  const nearestIso = entry.nearestUpcomingCloseIso;
  if (nearestIso) {
    const day = formatDayUtc(nearestIso);
    if (day) {
      parts.push(`Nearest upcoming close ${day}.`);
    }
  }

  // Sentence 4 — verbatim limitation marker (matches the Phase 77
  // `<RelationshipContext />` card's disclaimer language).
  parts.push('From visible records; may not include all related borrowers.');

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinAsks(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  const head = parts.slice(0, -1).join(', ');
  return `${head}, and ${parts[parts.length - 1]!}`;
}

function formatDayUtc(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
