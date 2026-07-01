// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveControlledLiveCutoverReadiness,
  CUTOVER_DOMAIN_KEYS,
} from '../../admin/controlledLiveCutoverReadiness';
import { deriveProductionEnvironmentVerification, PRODUCTION_ENVIRONMENT_CERTIFICATION } from '../../admin/productionEnvironmentVerification';
import { deriveFullProductionLaunchEvidence } from '../../admin/fullProductionLaunchEvidence';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';
import { ADVANCE_STAGE_WRITE_ENABLED } from '../../activation/stageProgressionActivation';

const ROOT = resolve(__dirname, '..', '..', '..');
const SMOKE_REL = 'src/activation/phase245ControlledLiveCutoverSmoke.test.ts';
const DOC_REL = 'docs/PHASE_245_CONTROLLED_LIVE_GATE_CUTOVER.md';

/**
 * Phase 245 — controlled cutover prep for the three PASS domains only. No live gate is
 * flipped (live schema unverified + no operator smoke), checklist + borrower stay
 * disabled, and full launch is not claimed.
 */
describe('Phase 245 — controlled live gate cutover governance contract', () => {
  it('addresses only the three PASS domains (checklist + borrower excluded)', () => {
    expect([...CUTOVER_DOMAIN_KEYS]).toEqual(['crmWriteback', 'portfolioBoarding', 'stageAdvancement']);
    expect(CUTOVER_DOMAIN_KEYS).not.toContain('documentChecklist');
    expect(CUTOVER_DOMAIN_KEYS).not.toContain('borrowerSend');
  });

  it('Completion Phase A: the targeted live gates are at safe defaults (off); the uncontrolled auto-advance write gate stays off', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(AUTO_STAGE_ADVANCE_ENABLED).toBe(false);
    // The uncontrolled automatic-advancement write gate intentionally stays off (production
    // uses governed explicit advancement, never uncontrolled automatic movement).
    expect(ADVANCE_STAGE_WRITE_ENABLED).toBe(false);
    // All six domains remain certified, backed by GO final-launch smoke artifacts.
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(6);
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
  });

  it('Completion Phase A: checklist + borrower gates are at safe defaults (off); their environment prerequisites still PASS', () => {
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(false);
    // The recorded environment-prerequisite evidence is unchanged by the live-gate reset.
    const evidence = deriveFullProductionLaunchEvidence();
    const byKey = new Map(evidence.domains.map((d) => [d.key, d]));
    expect(byKey.get('documentChecklist')?.environmentStatus).toBe('PASS');
    expect(byKey.get('borrowerSend')?.environmentStatus).toBe('PASS');
  });

  it('Launch Phase 5: evidence insufficient — full launch NOT achieved and enabledCount is 1', () => {
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
    const cutover = deriveControlledLiveCutoverReadiness();
    // The committed final-launch smoke evidence is insufficient (sentinel operator UPNs / no
    // machine proof), so NO cutover domain resolves enabled — cutover stays incomplete and the
    // ledger's own deploymentAllowed stays false. No fake activation.
    expect(cutover.cutoverCompleteCount).toBe(0);
    expect(cutover.deploymentAllowed).toBe(false);
    expect(cutover.fullLaunchAchieved).toBe(false);
  });

  it('every targeted domain has a rollback control and its gate flag is at the safe default (off), so not live', () => {
    const cutover = deriveControlledLiveCutoverReadiness();
    for (const d of cutover.domains) {
      expect(d.rollbackControl.length, d.key).toBeGreaterThan(0);
      // The live-write feature gate flags are at their SAFE DEFAULTS (off)...
      expect(d.gateFlagOn, d.key).toBe(false);
      // ...so (with insufficient final-launch evidence too) the domain does not resolve live.
      expect(d.enabled, d.key).toBe(false);
    }
  });

  it('the cutover smoke suite and the Phase 245 doc exist', () => {
    expect(existsSync(resolve(ROOT, SMOKE_REL))).toBe(true);
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = readFileSync(resolve(ROOT, DOC_REL), 'utf8');
    for (const section of [
      '## Outcome',
      '## Which gates changed',
      '## Smoke evidence',
      '## Remaining blockers for 6/6',
      '## Rollback plan',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/no live gate.*flipped/i);
    expect(doc).toMatch(/not performed/i);
  });
});
