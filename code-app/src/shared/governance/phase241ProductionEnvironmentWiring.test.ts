import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveFullActivationLaunchCertification } from '../../admin/fullActivationLaunchCertificationModel';
import {
  deriveProductionEnvironmentVerification,
  PRODUCTION_ENVIRONMENT_CERTIFICATION,
  type DomainEnvironmentCertification,
} from '../../admin/productionEnvironmentVerification';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const ARTIFACT_REL = 'src/admin/productionEnvironmentVerification.ts';
const MODEL_REL = 'src/admin/fullActivationLaunchCertificationModel.ts';
const DOC_REL = 'docs/PHASE_241_PRODUCTION_ENVIRONMENT_WIRING_AND_LIVE_CUTOVER.md';

const ALL_TRUE: DomainEnvironmentCertification = {
  newDealCreate: true,
  crmWriteback: true,
  documentChecklist: true,
  borrowerSend: true,
  stageAdvancement: true,
  portfolioBoarding: true,
};

describe('Phase 241 — production environment wiring governance contract', () => {
  it('ships every operator certification toggle false (no faked verification)', () => {
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).every((v) => v === false)).toBe(true);
    const src = read(ARTIFACT_REL);
    const certBlock = src.slice(
      src.indexOf('PRODUCTION_ENVIRONMENT_CERTIFICATION'),
      src.indexOf('ENVIRONMENT_VERIFICATION_STEPS'),
    );
    expect(certBlock).not.toMatch(/:\s*true/);
  });

  it('defaults to full launch NOT achieved: 0/6 enabled, fail-closed', () => {
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(0);
    expect(verification.fullLaunchReady).toBe(false);

    const model = deriveFullActivationLaunchCertification();
    expect(model.enabledCount).toBe(0);
    expect(model.fullLaunchAchieved).toBe(false);
    for (const d of model.domains) expect(d.status, d.id).toBe('blocked');
  });

  it('a domain resolves enabled ONLY when certified AND its gate flag is on', () => {
    // Certified but flag still off → not enabled.
    const certOnly = deriveProductionEnvironmentVerification({ certification: ALL_TRUE });
    expect(certOnly.enabledCount).toBe(0);
    expect(certOnly.domains.every((d) => d.enabled)).toBe(false);

    // Flag on but not certified → not enabled.
    const flagOnly = deriveProductionEnvironmentVerification({ gateFlags: ALL_TRUE });
    expect(flagOnly.enabledCount).toBe(0);

    // Both → enabled, full launch ready.
    const both = deriveProductionEnvironmentVerification({ certification: ALL_TRUE, gateFlags: ALL_TRUE });
    expect(both.enabledCount).toBe(6);
    expect(both.fullLaunchReady).toBe(true);
  });

  it('the verification artifact and the wired model flip no feature gate and add no hidden writes', () => {
    for (const rel of [ARTIFACT_REL, MODEL_REL]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/_ENABLED\s*=\s*true/);
      expect(src, rel).not.toMatch(/_ENABLED\s*=\s*[^=]/); // no flag re-assignment of any kind
      expect(src, rel).not.toMatch(/\bfetch\s*\(/);
      expect(src, rel).not.toMatch(/XMLHttpRequest/);
      expect(src, rel).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
      expect(src, rel).not.toMatch(/@microsoft\/power-apps/);
      expect(src, rel).not.toMatch(/from ['"][^'"]*\/generated\//);
    }
  });

  it('widens no route/permission and adds no uncontrolled borrower auto-send', () => {
    for (const rel of [ARTIFACT_REL, MODEL_REL]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/WORKSPACE_ROUTES|deriveWorkspaceLinks|useEntitledRoutes/);
      expect(src, rel).not.toMatch(/grantEntitlement|grantRole|addRole|securityRole/i);
      expect(src, rel).not.toMatch(/\bsendMail\b|\bsendBorrower|autoSend/i);
    }
  });

  it('the live-cutover doc exists and records the honest cutover state', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## Outcome (honest status)',
      '## Exact operator verification evidence used',
      '## Exact flags flipped',
      '## Exact missing operator command / portal action per domain',
      '## Rollback plan',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/Full launch is NOT achieved/i);
    expect(doc).toMatch(/enabledCount = 0 \/ 6/);
  });
});
