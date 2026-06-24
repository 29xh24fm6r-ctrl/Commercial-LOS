import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveProductionEnvironmentVerification, PRODUCTION_ENVIRONMENT_CERTIFICATION } from '../../admin/productionEnvironmentVerification';
import { deriveFullActivationLaunchCertification } from '../../admin/fullActivationLaunchCertificationModel';
import { deriveFullProductionLaunchEvidence } from '../../admin/fullProductionLaunchEvidence';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const EVIDENCE_REL = 'src/admin/fullProductionLaunchEvidence.ts';
const DOC_REL = 'docs/PHASE_243_FULL_SYSTEM_LIVE_ACTIVATION.md';

/**
 * Phase 243 governance — full production cutover may NOT be faked. Environment
 * evidence for four domains is BLOCKED/UNKNOWN, so they must stay uncertified and
 * fail-closed; full launch must remain not-achieved until all six are genuinely live.
 */
describe('Phase 243 — full system live activation governance contract', () => {
  it('does not claim full launch: enabledCount=1, fullLaunchAchieved=false', () => {
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);

    const model = deriveFullActivationLaunchCertification();
    expect(model.enabledCount).toBe(1);
    expect(model.fullLaunchAchieved).toBe(false);

    const evidence = deriveFullProductionLaunchEvidence();
    expect(evidence.enabledCount).toBe(1);
    expect(evidence.fullLaunchAchieved).toBe(false);
  });

  it('ties the launch decision to the fail-closed verification (single source of truth)', () => {
    const verification = deriveProductionEnvironmentVerification();
    const evidence = deriveFullProductionLaunchEvidence();
    // The evidence ledger never overrides the verification; it mirrors it.
    expect(evidence.fullLaunchAchieved).toBe(verification.fullLaunchReady);
    expect(evidence.enabledCount).toBe(verification.enabledCount);
  });

  it('certifies only New Deal create; the four blocked/unknown domains stay false (no fake flips)', () => {
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
    for (const key of ['crmWriteback', 'documentChecklist', 'borrowerSend', 'portfolioBoarding'] as const) {
      expect(PRODUCTION_ENVIRONMENT_CERTIFICATION[key], key).toBe(false);
    }
    // Exactly one certification toggle is true in the committed constant.
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(1);
  });

  it('keeps every not-yet-live domain disabled and fail-closed in the verification', () => {
    const verification = deriveProductionEnvironmentVerification();
    for (const d of verification.domains.filter((x) => x.key !== 'newDealCreate')) {
      expect(d.certified, d.key).toBe(false);
      expect(d.enabled, d.key).toBe(false);
    }
  });

  it('the evidence ledger flips no gate and fabricates no PASS', () => {
    const src = read(EVIDENCE_REL);
    expect(src).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/\bsendMail\b|\bsendBorrower|autoSend/i);
    // Blocked + unknown statuses are present (the honest recorded evidence), not faked PASS.
    expect(src).toMatch(/environmentStatus:\s*'BLOCKED'/);
    expect(src).toMatch(/environmentStatus:\s*'UNKNOWN'/);
  });

  it('the Phase 243 activation doc exists and records the honest outcome + operator actions', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## Outcome',
      '## Recorded environment evidence',
      '## Exact operator actions per blocked domain',
      '## Rollback plan',
      '## Definition of done',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/Full launch.*NOT achieved/i);
    expect(doc).toMatch(/enabledCount\s*=\s*1\s*\/\s*6/);
  });
});
