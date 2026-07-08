/**
 * Phase 4A — canonical Deal Reference category contract (the discriminator).
 *
 * The deal's Product Type / Loan Structure / Pricing Type are three separate
 * lookups on cr664_loandeal that all target the SAME reference table
 * `cr664_producttypereference`. Before Phase 4 there was NO way to tell which
 * rows belonged to which dropdown — the three lists were indistinguishable, so
 * every field showed the same flat list.
 *
 * Phase 4A adds a real Dataverse CHOICE discriminator column `cr664_category`
 * to that table. This module is the single source of truth for the three
 * categories and their option-set values, shared by:
 *   - the deal-facing loader (src/deals/write/dealReferenceOptions.ts),
 *   - the governed admin write + read (src/admin/dealReference/*),
 *   - the seed + schema scripts.
 *
 * It lives under src/shared/governance so BOTH the deals modules and the sealed
 * src/admin modules may import it (src/admin never imports a role module). Pure
 * data + pure helpers: no I/O, no SDK import, no role-module import.
 */

/** The three deal reference categories. Keys match the deal lookup field ids. */
export type DealReferenceCategory = 'productType' | 'loanStructure' | 'pricingType';

/** Stable ordered list of the three categories (UI + iteration order). */
export const DEAL_REFERENCE_CATEGORIES: readonly DealReferenceCategory[] = [
  'productType',
  'loanStructure',
  'pricingType',
];

/**
 * The `cr664_category` CHOICE (option-set) values on cr664_producttypereference.
 * These are the discriminator this phase introduces; the seed + admin writes set
 * them, and the loader filters by them so each dropdown shows only its category.
 */
export const DEAL_REFERENCE_CATEGORY_OPTION = {
  productType: 788190000,
  loanStructure: 788190001,
  pricingType: 788190002,
} as const satisfies Record<DealReferenceCategory, number>;

/** Human label per category (used in admin UI + validation copy). */
export const DEAL_REFERENCE_CATEGORY_LABEL = {
  productType: 'Product Type',
  loanStructure: 'Loan Structure',
  pricingType: 'Pricing Type',
} as const satisfies Record<DealReferenceCategory, string>;

/** The Dataverse discriminator column logical name. */
export const DEAL_REFERENCE_CATEGORY_COLUMN = 'cr664_category';
/** The reference table's OData entity set. */
export const DEAL_REFERENCE_ENTITY_SET = 'cr664_producttypereferences';
/** The reference table's logical (singular) name. */
export const DEAL_REFERENCE_TABLE_LOGICAL = 'cr664_producttypereference';

/** True for exactly the three known category keys. */
export function isDealReferenceCategory(v: unknown): v is DealReferenceCategory {
  return (
    typeof v === 'string' &&
    Object.prototype.hasOwnProperty.call(DEAL_REFERENCE_CATEGORY_OPTION, v)
  );
}

/** The `cr664_category` option value for a category. */
export function optionValueForCategory(category: DealReferenceCategory): number {
  return DEAL_REFERENCE_CATEGORY_OPTION[category];
}

/**
 * Reverse map: a `cr664_category` option value → its category, or undefined for
 * a missing / unrecognized value (an un-categorized legacy row).
 */
export function categoryForOptionValue(
  value: number | null | undefined,
): DealReferenceCategory | undefined {
  if (typeof value !== 'number') return undefined;
  for (const category of DEAL_REFERENCE_CATEGORIES) {
    if (DEAL_REFERENCE_CATEGORY_OPTION[category] === value) return category;
  }
  return undefined;
}
