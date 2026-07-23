/**
 * final-seven-workstreams Workstream 2 — the single canonical vocabulary for "an activity/
 * interaction was logged", shared by the deal-scoped writer (`../deals/logActivityActions.ts`) and
 * the CRM-scoped writer (`../crm/write/crmWriteAdapter.ts`). Neither Dataverse table
 * (cr664_dealtimelineevents, cr664_crmtimelineevents) has a dedicated outcome/next-follow-up
 * column (confirmed against both generated models) — this module is the ONE place that decides how
 * those two fields fold into a text field, so both writers render an identical format rather than
 * two independently-invented conventions.
 *
 * This module is pure (no SDK, no network, no React) — a plain vocabulary + text-formatting layer,
 * not a write path itself.
 */

export type CanonicalActivityType = 'call' | 'email' | 'meeting' | 'note';

export const CANONICAL_ACTIVITY_TYPES: readonly CanonicalActivityType[] = ['call', 'email', 'meeting', 'note'];

export const ACTIVITY_TYPE_LABEL: Record<CanonicalActivityType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  note: 'Note',
};

/** Options for a shared `<select>` across both the deal-scoped and CRM-scoped activity forms. */
export const ACTIVITY_TYPE_OPTIONS: readonly { readonly value: CanonicalActivityType; readonly label: string }[] =
  CANONICAL_ACTIVITY_TYPES.map((value) => ({ value, label: ACTIVITY_TYPE_LABEL[value] }));

/**
 * The real cr664_dealtimelineevent eventtype codes (`src/deals/activityQueries.ts`), reused
 * verbatim so any activity of a given type — whether logged from the deal cockpit or cross-written
 * from a CRM-scoped entry — shows up as the SAME kind of interaction on the deal's Activity
 * Timeline, never a generic note.
 */
export const ACTIVITY_TYPE_TO_DEAL_TIMELINE_EVENT_TYPE: Record<CanonicalActivityType, number> = {
  call: 788190000, // CallLogged
  email: 788190001, // EmailLogged
  note: 788190002, // NoteLogged
  meeting: 788190003, // MeetingLogged
};

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/**
 * Folds an optional outcome and next-follow-up date into a single free-text suffix, since neither
 * timeline table has dedicated columns for them. Returns an empty string when both are absent, so
 * appending this to a base summary/notes value is a no-op — callers must not assume this always
 * returns non-empty text.
 */
export function foldOutcomeAndFollowUp(outcome: string | undefined, nextFollowUpDate: string | undefined): string {
  const parts = [
    trimmed(outcome) ? `Outcome: ${trimmed(outcome)}` : '',
    trimmed(nextFollowUpDate) ? `Next follow-up: ${trimmed(nextFollowUpDate)}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Appends `foldOutcomeAndFollowUp`'s text onto a base string with a separator, only when non-empty. */
export function appendFoldedOutcomeAndFollowUp(
  base: string,
  outcome: string | undefined,
  nextFollowUpDate: string | undefined,
): string {
  const folded = foldOutcomeAndFollowUp(outcome, nextFollowUpDate);
  return folded ? `${base} · ${folded}` : base;
}
