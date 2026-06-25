/**
 * Phase 254A — Portfolio relationship idempotency decision (hotfix).
 *
 * The portfolio buildout must be idempotent by BOTH the relationship schema name AND the
 * referencing lookup attribute. Dataverse rejects relationship creation when the referencing
 * lookup attribute already exists — which is exactly what happened in production: the boarding
 * spine had already created the child→root lookup `cr664_PortfolioBoardedLoan` (under its own
 * relationship schema name, e.g. `cr664_portfolioboardedloanborrower_root`), so probing only
 * for the runtime relationship name `cr664_portfolioboardedloan_borrower` found nothing, and
 * the POST failed with "An attribute with the specified name cr664_PortfolioBoardedLoan
 * already exists for entity cr664_Portfolioboardedloanborrower."
 *
 * This pure function encodes the decision the PowerShell create script + verifier mirror.
 * It is the portfolio twin of src/crm/crmRelationshipIdempotency.ts (kept separate to avoid
 * cross-domain coupling with the CRM track).
 *
 * Rules (create-missing-only, fail-closed, never destructive):
 *   - relationship schema already exists                          -> present (skip)
 *   - referencing lookup attribute exists AND targets the expected
 *     referenced entity                                           -> present (skip; covered)
 *   - an attribute with that name exists but is NOT a lookup, OR a
 *     lookup that targets a DIFFERENT entity                      -> mismatch (FAIL CLOSED)
 *   - neither exists, apply mode                                  -> create
 *   - neither exists, dry-run                                     -> planned
 */

export type PortfolioRelationshipAction = 'present' | 'mismatch' | 'planned' | 'create';

export interface PortfolioLookupAttributeState {
  /** An attribute with the referencing lookup's logical name exists on the referencing entity. */
  readonly exists: boolean;
  /** That attribute is a Lookup (as opposed to some other type sharing the name). */
  readonly isLookup: boolean;
  /** The lookup's target entity logical names (Targets). */
  readonly targets: readonly string[];
}

export interface PortfolioRelationshipResolveInput {
  /** A relationship with the expected schema name already exists. */
  readonly relationshipSchemaExists: boolean;
  /**
   * The referencing lookup attribute's live state, or null when it could not be inspected
   * (e.g. dry-run with no token) — then existence is treated as unknown (never overwrite).
   */
  readonly lookup: PortfolioLookupAttributeState | null;
  /** The expected referenced (target) entity logical name. */
  readonly expectedTarget: string;
  /** Apply mode (vs dry-run). */
  readonly apply: boolean;
}

export interface PortfolioRelationshipDecision {
  readonly action: PortfolioRelationshipAction;
  readonly reason: string;
}

export function resolvePortfolioRelationshipAction(
  input: PortfolioRelationshipResolveInput,
): PortfolioRelationshipDecision {
  if (input.relationshipSchemaExists) {
    return { action: 'present', reason: 'relationship schema already exists' };
  }
  if (input.lookup && input.lookup.exists) {
    if (!input.lookup.isLookup) {
      return { action: 'mismatch', reason: 'an attribute with the referencing name exists but is not a lookup' };
    }
    if (input.lookup.targets.includes(input.expectedTarget)) {
      // Idempotent: the lookup (and thus a backing relationship) is already in place, possibly
      // under a different relationship schema name (the spine's *_root names). Count present;
      // never recreate — recreating would hit the "attribute already exists" rejection.
      return { action: 'present', reason: 'referencing lookup attribute already exists with the expected target' };
    }
    return {
      action: 'mismatch',
      reason: `referencing lookup targets ${input.lookup.targets.join(', ') || '(none)'}, expected ${input.expectedTarget}`,
    };
  }
  return input.apply
    ? { action: 'create', reason: 'no relationship and no referencing lookup — create' }
    : { action: 'planned', reason: 'no relationship and no referencing lookup — would create (dry-run)' };
}

/** Tri-state coverage for the verifier: a relationship is covered iff its action resolves present. */
export type PortfolioRelationshipCoverage = 'present' | 'missing' | 'unknown' | 'mismatch';

export function resolvePortfolioRelationshipCoverage(input: {
  relationshipSchemaExists: boolean;
  lookup: PortfolioLookupAttributeState | null;
  expectedTarget: string;
}): PortfolioRelationshipCoverage {
  if (input.relationshipSchemaExists) return 'present';
  // A null lookup means we could not inspect it (transient / no token) — NOT a confirmed miss.
  if (input.lookup === null) return 'unknown';
  if (!input.lookup.exists) return 'missing';
  if (!input.lookup.isLookup) return 'mismatch';
  return input.lookup.targets.includes(input.expectedTarget) ? 'present' : 'mismatch';
}

/** True only when the relationship is verifiably covered (correct schema name OR correctly-targeted lookup). */
export function isPortfolioRelationshipCovered(input: {
  relationshipSchemaExists: boolean;
  lookup: PortfolioLookupAttributeState | null;
  expectedTarget: string;
}): boolean {
  return resolvePortfolioRelationshipCoverage(input) === 'present';
}
