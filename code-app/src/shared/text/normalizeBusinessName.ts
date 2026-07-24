/**
 * Shared business-entity-name normalization, so every duplicate-detection
 * surface (deal creation, CRM organizations, ...) treats "Acme LLC",
 * "ACME, L.L.C.", and "acme llc" as the same underlying name. Extracted from
 * the deal-creation duplicate detector (Phase 179A / D12) so a second,
 * independently-drifting copy doesn't appear the next time this rule is
 * needed elsewhere.
 */

// Common U.S. business-entity suffixes. Stripped (with a trailing period
// tolerated) so capitalization/punctuation/legal-suffix variants of the same
// entity normalize to the same key.
const LEGAL_SUFFIX_RE = /\b(l\s*l\s*c|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc|pc)\b\.?/g;

export function normalizeBusinessName(s: string | undefined): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(LEGAL_SUFFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}
