/**
 * Advisor / professional role vocabulary (Phase 4).
 *
 * The typed roles a Professional/Advisor party can play for a client — captured as
 * the `cr664_role` on a governed relationship (reusing the existing relationship
 * schema). **CDC (Certified Development Company) is first-class**: on an SBA 504 it
 * is a structural counterparty, not merely an advisor.
 *
 * EDITABLE CONFIG: confirm the set + any additions (e.g. Environmental Consultant,
 * SBA Packager) with Old Glory Bank. Stored as a validated free-text role string.
 */

export const ADVISOR_ROLES = [
  'CPA / Accountant',
  'Attorney',
  'CDC (Certified Development Company)',
  'Insurance Agent',
  'Appraiser',
  'Title / Escrow',
  'Business Broker',
  'Financial Advisor',
  'Environmental Consultant',
  'SBA Packager',
  'Referral Source',
] as const;

export type AdvisorRole = (typeof ADVISOR_ROLES)[number];

export const ADVISOR_ROLE_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  ADVISOR_ROLES.map((r) => ({ value: r, label: r }));

const ADVISOR_ROLE_SET: ReadonlySet<string> = new Set(ADVISOR_ROLES);

/** True only for an exact, on-list advisor role. */
export function isValidAdvisorRole(value: string): value is AdvisorRole {
  return ADVISOR_ROLE_SET.has(value);
}
