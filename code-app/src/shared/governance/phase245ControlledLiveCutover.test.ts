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

  it('flips NO live gate this phase (all targeted gates remain at their source default)', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(ADVANCE_STAGE_WRITE_ENABLED).toBe(false);
    expect(AUTO_STAGE_ADVANCE_ENABLED).toBe(false);
    // Only New Deal create stays certified (Phase 227/228A) — no new certification flipped.
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(1);
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
  });

  it('keeps checklist + borrower gates false and their evidence UNKNOWN (no fake signoff / connector)', () => {
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(false);
    const evidence = deriveFullProductionLaunchEvidence();
    const byKey = new Map(evidence.domains.map((d) => [d.key, d]));
    // Phase 251: lending-owner signoff recorded → documentChecklist env PASS; its live gate stays false above.
    expect(byKey.get('documentChecklist')?.environmentStatus).toBe('PASS');
    // Phase 250: Outlook connector registered (power.config.json) → borrowerSend env PASS; its send gate stays false above.
    expect(byKey.get('borrowerSend')?.environmentStatus).toBe('PASS');
  });

  it('does not claim full launch and enabledCount stays 1', () => {
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
    const cutover = deriveControlledLiveCutoverReadiness();
    expect(cutover.cutoverCompleteCount).toBe(0);
    expect(cutover.deploymentAllowed).toBe(false);
    expect(cutover.fullLaunchAchieved).toBe(false);
  });

  it('every targeted domain has a rollback control and stays fail-closed (gate off)', () => {
    const cutover = deriveControlledLiveCutoverReadiness();
    for (const d of cutover.domains) {
      expect(d.rollbackControl.length, d.key).toBeGreaterThan(0);
      expect(d.gateFlagOn, d.key).toBe(false);
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
