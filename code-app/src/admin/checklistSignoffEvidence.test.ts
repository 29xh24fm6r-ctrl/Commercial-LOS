// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveChecklistSignoffReadiness,
  validateChecklistSignoff,
  parseChecklistSignoffArtifact,
  CHECKLIST_RULESET_SIGNOFF,
  CHECKLIST_SIGNOFF_ARTIFACT_PATH,
  CHECKLIST_REVIEW_CATEGORIES,
  REQUIRED_SIGNOFF_FIELDS,
  type ChecklistRulesetSignoff,
} from './checklistSignoffEvidence';

const ROOT = resolve(__dirname, '..', '..');

const COMPLETE: ChecklistRulesetSignoff = {
  approvedBy: 'Jane Owner',
  approverRole: 'Lending Owner / Super-Admin',
  signedAtIso: '2026-06-25T12:00:00Z',
  scope: 'All commercial products, Intake→Open stages',
  rulesetVersion: '2026.06',
  rollback: 'Set DOCUMENT_CHECKLIST_GENERATION_ENABLED to false',
  evidenceRef: 'doc://signoff/checklist-2026-06',
};

describe('Phase 251 — checklist lending-owner signoff evidence (consumed)', () => {
  it('the committed signoff is RECORDED → SIGNED, but the live gate stays false', () => {
    expect(CHECKLIST_RULESET_SIGNOFF).not.toBeNull();
    expect(validateChecklistSignoff(CHECKLIST_RULESET_SIGNOFF).valid).toBe(true);
    const vm = deriveChecklistSignoffReadiness();
    expect(vm.status).toBe('SIGNED');
    expect(vm.signed).toBe(true);
    // Signoff recorded does NOT flip the live gate.
    expect(vm.generationGateEnabled).toBe(false);
    expect(vm.writeGateEnabled).toBe(false);
    expect(vm.gateFlipBlocked).toBe(true);
  });

  it('the recorded constant is grounded in the real committed signoff artifact', () => {
    const md = readFileSync(resolve(ROOT, CHECKLIST_SIGNOFF_ARTIFACT_PATH), 'utf8');
    const parsed = parseChecklistSignoffArtifact(md);
    expect(parsed).not.toBeNull();
    expect(validateChecklistSignoff(parsed).valid).toBe(true);
    expect(parsed?.approvedBy).toBe(CHECKLIST_RULESET_SIGNOFF?.approvedBy);
    expect(parsed?.signedAtIso).toBe(CHECKLIST_RULESET_SIGNOFF?.signedAtIso);
    expect(parsed?.evidenceRef).toBe(CHECKLIST_SIGNOFF_ARTIFACT_PATH);
  });

  it('a NOT-APPROVED or absent artifact does not parse to a signoff (fail-closed)', () => {
    expect(parseChecklistSignoffArtifact('Decision:\n- [ ] APPROVED\n- [x] NOT APPROVED')).toBeNull();
    expect(parseChecklistSignoffArtifact('no decision here')).toBeNull();
    expect(parseChecklistSignoffArtifact('')).toBeNull();
  });

  it('exposes the review checklist and required signoff fields', () => {
    expect(CHECKLIST_REVIEW_CATEGORIES.length).toBeGreaterThan(3);
    expect(REQUIRED_SIGNOFF_FIELDS).toContain('approvedBy');
    expect(REQUIRED_SIGNOFF_FIELDS).toContain('rollback');
  });

  it('a complete signoff validates and reads SIGNED; an incomplete one fails closed', () => {
    expect(validateChecklistSignoff(COMPLETE).valid).toBe(true);
    expect(deriveChecklistSignoffReadiness(COMPLETE).status).toBe('SIGNED');
    const missingScope = { ...COMPLETE, scope: '   ' };
    expect(validateChecklistSignoff(missingScope).missing).toContain('scope');
    expect(deriveChecklistSignoffReadiness(missingScope).status).toBe('UNKNOWN');
    expect(deriveChecklistSignoffReadiness(null).status).toBe('UNKNOWN');
  });
});
