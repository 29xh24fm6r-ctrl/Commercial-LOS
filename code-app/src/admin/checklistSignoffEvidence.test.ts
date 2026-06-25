// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  deriveChecklistSignoffReadiness,
  validateChecklistSignoff,
  CHECKLIST_RULESET_SIGNOFF,
  CHECKLIST_REVIEW_CATEGORIES,
  REQUIRED_SIGNOFF_FIELDS,
  type ChecklistRulesetSignoff,
} from './checklistSignoffEvidence';

const COMPLETE: ChecklistRulesetSignoff = {
  approvedBy: 'Jane Owner',
  approverRole: 'Lending Owner / Super-Admin',
  signedAtIso: '2026-06-25T12:00:00Z',
  scope: 'All commercial products, Intake→Open stages',
  rulesetVersion: '2026.06',
  rollback: 'Set DOCUMENT_CHECKLIST_GENERATION_ENABLED to false',
  evidenceRef: 'doc://signoff/checklist-2026-06',
};

describe('Phase 249 — checklist lending-owner signoff evidence', () => {
  it('the committed signoff is null (no fabricated signoff) → UNKNOWN, no gate flip', () => {
    expect(CHECKLIST_RULESET_SIGNOFF).toBeNull();
    const vm = deriveChecklistSignoffReadiness();
    expect(vm.status).toBe('UNKNOWN');
    expect(vm.signed).toBe(false);
    expect(vm.generationGateEnabled).toBe(false);
    expect(vm.writeGateEnabled).toBe(false);
    expect(vm.gateFlipBlocked).toBe(true);
    expect(vm.missingOperatorActions.length).toBeGreaterThan(0);
  });

  it('exposes the review checklist and required signoff fields', () => {
    expect(CHECKLIST_REVIEW_CATEGORIES.length).toBeGreaterThan(3);
    expect(REQUIRED_SIGNOFF_FIELDS).toContain('approvedBy');
    expect(REQUIRED_SIGNOFF_FIELDS).toContain('rollback');
  });

  it('a complete signoff validates and reads SIGNED', () => {
    expect(validateChecklistSignoff(COMPLETE).valid).toBe(true);
    expect(deriveChecklistSignoffReadiness(COMPLETE).status).toBe('SIGNED');
  });

  it('an incomplete or empty signoff is fail-closed (UNKNOWN) and names the missing field', () => {
    const missingScope = { ...COMPLETE, scope: '   ' };
    const v = validateChecklistSignoff(missingScope);
    expect(v.valid).toBe(false);
    expect(v.missing).toContain('scope');
    expect(deriveChecklistSignoffReadiness(missingScope).status).toBe('UNKNOWN');
    expect(validateChecklistSignoff(null).valid).toBe(false);
  });
});
