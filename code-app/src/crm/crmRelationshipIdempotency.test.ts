// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  resolveCrmRelationshipAction,
  isCrmRelationshipCovered,
} from './crmRelationshipIdempotency';

const ORG = 'cr664_crmorganization';

describe('Phase 253A — CRM relationship idempotency', () => {
  it('an existing relationship schema name skips creation (present)', () => {
    const d = resolveCrmRelationshipAction({ relationshipSchemaExists: true, lookup: null, expectedTarget: ORG, apply: true });
    expect(d.action).toBe('present');
  });

  it('an existing lookup attribute with the correct target skips creation and counts present', () => {
    const d = resolveCrmRelationshipAction({
      relationshipSchemaExists: false,
      lookup: { exists: true, isLookup: true, targets: [ORG] },
      expectedTarget: ORG,
      apply: true,
    });
    expect(d.action).toBe('present');
    expect(isCrmRelationshipCovered({ relationshipSchemaExists: false, lookup: { exists: true, isLookup: true, targets: [ORG] }, expectedTarget: ORG })).toBe(true);
  });

  it('an existing lookup attribute with a WRONG target fails closed (mismatch)', () => {
    const d = resolveCrmRelationshipAction({
      relationshipSchemaExists: false,
      lookup: { exists: true, isLookup: true, targets: ['cr664_loandeal'] },
      expectedTarget: ORG,
      apply: true,
    });
    expect(d.action).toBe('mismatch');
    expect(d.reason).toMatch(/expected cr664_crmorganization/);
  });

  it('an existing non-lookup attribute with the referencing name fails closed (mismatch)', () => {
    const d = resolveCrmRelationshipAction({
      relationshipSchemaExists: false,
      lookup: { exists: true, isLookup: false, targets: [] },
      expectedTarget: ORG,
      apply: true,
    });
    expect(d.action).toBe('mismatch');
  });

  it('a missing relationship/attribute is planned in dry-run', () => {
    const d = resolveCrmRelationshipAction({ relationshipSchemaExists: false, lookup: { exists: false, isLookup: false, targets: [] }, expectedTarget: ORG, apply: false });
    expect(d.action).toBe('planned');
  });

  it('a missing relationship/attribute is created in apply mode', () => {
    const d = resolveCrmRelationshipAction({ relationshipSchemaExists: false, lookup: { exists: false, isLookup: false, targets: [] }, expectedTarget: ORG, apply: true });
    expect(d.action).toBe('create');
  });

  it('an uninspectable lookup (null, e.g. no token) plans in dry-run rather than overwriting', () => {
    expect(resolveCrmRelationshipAction({ relationshipSchemaExists: false, lookup: null, expectedTarget: ORG, apply: false }).action).toBe('planned');
  });
});
