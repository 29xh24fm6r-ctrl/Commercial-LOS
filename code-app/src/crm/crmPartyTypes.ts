/**
 * CRM party-type classification (Phase 2).
 *
 * Replaces free-text "Type" on a CRM company with a validated, code-defined enum so
 * the data is comparable across the book. **Professional/Advisor** classifies advisor
 * parties (CPA, CDC, attorney, appraiser…) whose advisory roles are then captured as
 * typed relationships (Phase 4).
 *
 * EDITABLE CONFIG: confirm this set matches how Old Glory Bank works before relying on
 * it; it is intentionally a single small list so the vocabulary stays governable.
 * Stored on the existing `cr664_organizationtype` column (no schema change).
 */

export const CRM_PARTY_TYPES = [
  'Borrower',
  'Guarantor',
  'Prospect',
  'Vendor',
  'Referral Source',
  'Professional/Advisor',
] as const;

export type CrmPartyType = (typeof CRM_PARTY_TYPES)[number];

/** {value,label} options for a Select (value === label; the stored value is the label). */
export const CRM_PARTY_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  CRM_PARTY_TYPES.map((t) => ({ value: t, label: t }));

const PARTY_TYPE_SET: ReadonlySet<string> = new Set(CRM_PARTY_TYPES);

/** True only for an exact, on-list party type. Empty string is NOT valid here. */
export function isValidPartyType(value: string): value is CrmPartyType {
  return PARTY_TYPE_SET.has(value);
}
