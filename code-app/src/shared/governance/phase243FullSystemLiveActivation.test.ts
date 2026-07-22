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
  it('does NOT claim full launch — evidence insufficient: enabledCount=1, fullLaunchAchieved=false (Launch Phase 5)', () => {
    // Launch truth derives from the committed final-launch smoke evidence integrity. That
    // evidence is insufficient for the five evidence domains, so full launch stays not-achieved
    // and only newDealCreate (pilot-certified) is enabled.
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

  it('certifies all six domains after the GO smoke artifacts (Phase 256B full activation)', () => {
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
    for (const key of ['crmWriteback', 'documentChecklist', 'borrowerSend', 'portfolioBoarding'] as const) {
      expect(PRODUCTION_ENVIRONMENT_CERTIFICATION[key], key).toBe(true);
    }
    // All six certification toggles are true in the committed constant.
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(6);
  });

  it('the five evidence domains stay certified but NOT live-enabled — evidence insufficient (Launch Phase 5)', () => {
    const verification = deriveProductionEnvironmentVerification();
    for (const d of verification.domains.filter((x) => x.key !== 'newDealCreate')) {
      // Certification toggle remains true (unchanged), but the domain is honestly NOT enabled
      // because its final-launch smoke evidence is present-but-insufficient.
      expect(d.certified, d.key).toBe(true);
      // CRM-K: crmWriteback's committed smoke is attributed/HIGH; Workstream K's re-captured
      // portfolioBoarding smoke now also grades HIGH. Both stay NOT enabled because their gate
      // flags are off. The other three remain evidence-insufficient.
      expect(d.evidenceInsufficient, d.key).toBe(d.key !== 'crmWriteback' && d.key !== 'portfolioBoarding');
      expect(d.enabled, d.key).toBe(false);
    }
  });

  it('the evidence ledger flips no gate and fabricates no PASS', () => {
    const src = read(EVIDENCE_REL);
    expect(src).not.toMatch(/_ENABLED\s*=\s*true/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
    expect(src).not.toMatch(/\bsendMail\b|\bsendBorrower|autoSend/i);
    // Unknown statuses are present (the honest recorded pending evidence), not faked PASS.
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
