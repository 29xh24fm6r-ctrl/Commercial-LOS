// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  resolvePortfolioRelationshipAction,
  resolvePortfolioRelationshipCoverage,
  isPortfolioRelationshipCovered,
} from './portfolioRelationshipIdempotency';

const ROOT = 'cr664_portfolioboardedloan';

describe('Phase 254A — portfolio relationship idempotency (create decision)', () => {
  it('an existing relationship schema name skips creation (present)', () => {
    const d = resolvePortfolioRelationshipAction({ relationshipSchemaExists: true, lookup: null, expectedTarget: ROOT, apply: true });
    expect(d.action).toBe('present');
  });

  it('an existing lookup attribute with the CORRECT target skips creation and counts present', () => {
    const d = resolvePortfolioRelationshipAction({
      relationshipSchemaExists: false,
      lookup: { exists: true, isLookup: true, targets: [ROOT] },
      expectedTarget: ROOT,
      apply: true,
    });
    expect(d.action).toBe('present');
    expect(d.reason).toMatch(/referencing lookup attribute already exists/);
  });

  it('an existing lookup attribute with a WRONG target fails closed (mismatch)', () => {
    const d = resolvePortfolioRelationshipAction({
      relationshipSchemaExists: false,
      lookup: { exists: true, isLookup: true, targets: ['cr664_loandeal'] },
      expectedTarget: ROOT,
      apply: true,
    });
    expect(d.action).toBe('mismatch');
    expect(d.reason).toMatch(/expected cr664_portfolioboardedloan/);
  });

  it('an existing NON-lookup attribute with the referencing name fails closed (mismatch)', () => {
    const d = resolvePortfolioRelationshipAction({
      relationshipSchemaExists: false,
      lookup: { exists: true, isLookup: false, targets: [] },
      expectedTarget: ROOT,
      apply: true,
    });
    expect(d.action).toBe('mismatch');
  });

  it('a missing relationship/attribute is planned in dry-run', () => {
    const d = resolvePortfolioRelationshipAction({ relationshipSchemaExists: false, lookup: { exists: false, isLookup: false, targets: [] }, expectedTarget: ROOT, apply: false });
    expect(d.action).toBe('planned');
  });

  it('a missing relationship/attribute is created in apply mode', () => {
    const d = resolvePortfolioRelationshipAction({ relationshipSchemaExists: false, lookup: { exists: false, isLookup: false, targets: [] }, expectedTarget: ROOT, apply: true });
    expect(d.action).toBe('create');
  });

  it('an uninspectable lookup (null, e.g. no token) plans in dry-run rather than overwriting', () => {
    expect(resolvePortfolioRelationshipAction({ relationshipSchemaExists: false, lookup: null, expectedTarget: ROOT, apply: false }).action).toBe('planned');
    // Even in apply mode, a null lookup must NOT silently overwrite — it resolves to create only
    // because the caller (PS) re-probes; the pure decision treats null as "not found" → create.
    expect(resolvePortfolioRelationshipAction({ relationshipSchemaExists: false, lookup: null, expectedTarget: ROOT, apply: true }).action).toBe('create');
  });
});

describe('Phase 254A — portfolio relationship coverage (verifier, tri-state)', () => {
  it('present via relationship schema name', () => {
    expect(resolvePortfolioRelationshipCoverage({ relationshipSchemaExists: true, lookup: null, expectedTarget: ROOT })).toBe('present');
  });

  it('present via a correctly-targeted referencing lookup (different relationship name)', () => {
    expect(
      resolvePortfolioRelationshipCoverage({ relationshipSchemaExists: false, lookup: { exists: true, isLookup: true, targets: [ROOT] }, expectedTarget: ROOT }),
    ).toBe('present');
    expect(isPortfolioRelationshipCovered({ relationshipSchemaExists: false, lookup: { exists: true, isLookup: true, targets: [ROOT] }, expectedTarget: ROOT })).toBe(true);
  });

  it('a WRONG-target lookup is NOT counted as covered (mismatch, never silently valid)', () => {
    expect(
      resolvePortfolioRelationshipCoverage({ relationshipSchemaExists: false, lookup: { exists: true, isLookup: true, targets: ['systemuser'] }, expectedTarget: ROOT }),
    ).toBe('mismatch');
    expect(isPortfolioRelationshipCovered({ relationshipSchemaExists: false, lookup: { exists: true, isLookup: true, targets: ['systemuser'] }, expectedTarget: ROOT })).toBe(false);
  });

  it('a confirmed-absent lookup is missing', () => {
    expect(resolvePortfolioRelationshipCoverage({ relationshipSchemaExists: false, lookup: { exists: false, isLookup: false, targets: [] }, expectedTarget: ROOT })).toBe('missing');
  });

  it('an uninspectable lookup is unknown/transient — NOT a false missing', () => {
    expect(resolvePortfolioRelationshipCoverage({ relationshipSchemaExists: false, lookup: null, expectedTarget: ROOT })).toBe('unknown');
    expect(isPortfolioRelationshipCovered({ relationshipSchemaExists: false, lookup: null, expectedTarget: ROOT })).toBe(false);
  });
});
