/**
 * Phase 253A — CRM relationship idempotency decision.
 *
 * The CRM buildout must be idempotent by BOTH the relationship schema name AND the
 * referencing lookup attribute. Dataverse rejects relationship creation if the lookup
 * attribute already exists, even when the relationship schema-name probe found nothing.
 * This pure function encodes the decision the PowerShell create script + verifier mirror.
 *
 * Rules (create-missing-only, fail-closed):
 *   - relationship schema already exists                          -> present (skip)
 *   - referencing lookup attribute exists AND targets the expected
 *     referenced entity                                           -> present (skip)
 *   - an attribute with that name exists but is NOT a lookup, OR a
 *     lookup that targets a DIFFERENT entity                      -> mismatch (FAIL CLOSED)
 *   - neither exists, apply mode                                  -> create
 *   - neither exists, dry-run                                     -> planned
 */

export type CrmRelationshipAction = 'present' | 'mismatch' | 'planned' | 'create';

export interface LookupAttributeState {
  /** An attribute with the referencing lookup's logical name exists on the referencing entity. */
  readonly exists: boolean;
  /** That attribute is a Lookup (as opposed to some other type sharing the name). */
  readonly isLookup: boolean;
  /** The lookup's target entity logical names (Targets). */
  readonly targets: readonly string[];
}

export interface CrmRelationshipResolveInput {
  /** A relationship with the expected schema name already exists. */
  readonly relationshipSchemaExists: boolean;
  /**
   * The referencing lookup attribute's live state, or null when it could not be
   * inspected (e.g. dry-run with no token) — then existence is treated as unknown.
   */
  readonly lookup: LookupAttributeState | null;
  /** The expected referenced (target) entity logical name. */
  readonly expectedTarget: string;
  /** Apply mode (vs dry-run). */
  readonly apply: boolean;
}

export interface CrmRelationshipDecision {
  readonly action: CrmRelationshipAction;
  readonly reason: string;
}

export function resolveCrmRelationshipAction(input: CrmRelationshipResolveInput): CrmRelationshipDecision {
  if (input.relationshipSchemaExists) {
    return { action: 'present', reason: 'relationship schema already exists' };
  }
  if (input.lookup && input.lookup.exists) {
    if (!input.lookup.isLookup) {
      return { action: 'mismatch', reason: 'an attribute with the referencing name exists but is not a lookup' };
    }
    if (input.lookup.targets.includes(input.expectedTarget)) {
      // Idempotent: the lookup (and thus the relationship) is already in place, possibly
      // under a different relationship schema name. Count present; never recreate.
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

/** Convenience: an action that should count toward "relationship coverage" in verification. */
export function isCrmRelationshipCovered(input: { relationshipSchemaExists: boolean; lookup: LookupAttributeState | null; expectedTarget: string }): boolean {
  return resolveCrmRelationshipAction({ ...input, apply: false }).action === 'present';
}
