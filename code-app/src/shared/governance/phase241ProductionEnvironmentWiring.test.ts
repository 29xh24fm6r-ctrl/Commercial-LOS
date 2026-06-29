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

const ALL_FALSE: DomainEnvironmentCertification = {
  newDealCreate: false,
  crmWriteback: false,
  documentChecklist: false,
  borrowerSend: false,
  stageAdvancement: false,
  portfolioBoarding: false,
};

describe('Phase 241 — production environment wiring governance contract', () => {
  it('certifies all six domains after the GO smoke artifacts (Phase 256B full activation)', () => {
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
    const others = Object.entries(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter(([k]) => k !== 'newDealCreate');
    expect(others.every(([, v]) => v === true)).toBe(true);

    const src = read(ARTIFACT_REL);
    const certBlock = src.slice(
      src.indexOf('export const PRODUCTION_ENVIRONMENT_CERTIFICATION'),
      src.indexOf('export const ENVIRONMENT_VERIFICATION_STEPS'),
    );
    // All six true toggles in the committed certification constant.
    expect(certBlock.match(/:\s*true/g) ?? []).toHaveLength(6);
  });

  it('evidence insufficient — only newDealCreate enabled by default: 1/6, full launch NOT achieved (Launch Phase 5)', () => {
    // Launch Phase 5: launch truth derives from the committed final-launch smoke evidence
    // integrity (Phase 1 authority). The committed evidence is insufficient (sentinel
    // operator UPNs / no machine proof) for the five evidence domains, so they stay NOT
    // enabled even though their certification toggle and gate flag are on. Only newDealCreate
    // (pilot-certified, not final-launch-smoke-gated) is enabled.
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
    expect(verification.domains.find((d) => d.key === 'newDealCreate')?.enabled).toBe(true);
    for (const d of verification.domains.filter((x) => x.key !== 'newDealCreate')) {
      expect(d.enabled, d.key).toBe(false);
      expect(d.evidenceInsufficient, d.key).toBe(true);
    }

    const model = deriveFullActivationLaunchCertification();
    expect(model.enabledCount).toBe(1);
    expect(model.fullLaunchAchieved).toBe(false);
    const byId = new Map(model.domains.map((d) => [d.id, d]));
    expect(byId.get('new-deal-create')?.status).toBe('enabled');
    for (const d of model.domains.filter((x) => x.id !== 'new-deal-create')) {
      expect(d.status, d.id).not.toBe('enabled');
    }
  });

  it('a domain resolves enabled ONLY when certified AND its gate flag is on', () => {
    // Certified but every flag off → nothing enabled.
    const certOnly = deriveProductionEnvironmentVerification({ certification: ALL_TRUE, gateFlags: ALL_FALSE });
    expect(certOnly.enabledCount).toBe(0);
    expect(certOnly.domains.every((d) => d.enabled)).toBe(false);

    // Flags on but nothing certified → nothing enabled.
    const flagOnly = deriveProductionEnvironmentVerification({ certification: ALL_FALSE, gateFlags: ALL_TRUE });
    expect(flagOnly.enabledCount).toBe(0);

    // Certified + flags on but evidence still insufficient (Launch Phase 5 default) → still
    // NOT enabled, because launch truth derives from the final-launch smoke evidence integrity.
    const certAndFlags = deriveProductionEnvironmentVerification({ certification: ALL_TRUE, gateFlags: ALL_TRUE });
    expect(certAndFlags.enabledCount).toBe(1); // only newDealCreate (pilot-certified, no final-launch smoke gate)
    expect(certAndFlags.fullLaunchReady).toBe(false);

    // All three factors (certified + flags + HIGH evidence) → enabled, full launch ready.
    const all = deriveProductionEnvironmentVerification({ certification: ALL_TRUE, gateFlags: ALL_TRUE, evidenceHigh: ALL_TRUE });
    expect(all.enabledCount).toBe(6);
    expect(all.fullLaunchReady).toBe(true);
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
