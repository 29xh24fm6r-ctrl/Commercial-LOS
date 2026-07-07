/**
 * Eligibility rule for mirroring a CRM Hub company (cr664_crmorganization) into
 * a deal-linkable canonical client (cr664_clientrelationship).
 *
 * The deal lookup cr664_loandeal.cr664_Client targets cr664_clientrelationship,
 * NOT cr664_crmorganization. So a company created in CRM Hub is only
 * deal-linkable once a governed borrower/client mirror exists. That mirror is
 * permitted ONLY when the company's type marks it as a borrower/client party —
 * never for vendors, referral sources, advisors, or contacts.
 *
 * Pure: no IO, no Dataverse import. Shared by the governed bridge, the Add
 * Company follow-up, and the Link CRM client option loader so the "is this
 * deal-linkable?" decision is defined in exactly one place.
 */

/**
 * Company types that warrant a deal-linkable canonical client mirror. Matched
 * case-insensitively against the free-text cr664_organizationtype. "Borrower"
 * is the CRM party type (see crmPartyTypes); "Client" is accepted for books
 * that label the borrowing relationship that way.
 */
export const DEAL_LINKABLE_ORG_TYPES = ['Borrower', 'Client'] as const;

export type DealLinkableOrgType = (typeof DEAL_LINKABLE_ORG_TYPES)[number];

const NORMALIZED = new Set(DEAL_LINKABLE_ORG_TYPES.map((t) => t.toLowerCase()));

/**
 * True when a company of this type should get (or already have) a canonical
 * client mirror. Blank / unknown / vendor / advisor types are NOT eligible.
 */
export function isDealLinkableOrgType(organizationType: string | null | undefined): boolean {
  return NORMALIZED.has((organizationType ?? '').trim().toLowerCase());
}
