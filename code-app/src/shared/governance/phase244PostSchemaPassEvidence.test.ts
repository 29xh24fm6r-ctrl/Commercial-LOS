// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveFullProductionLaunchEvidence,
  ENVIRONMENT_EVIDENCE_COMMIT,
} from '../../admin/fullProductionLaunchEvidence';
import { deriveProductionEnvironmentVerification, PRODUCTION_ENVIRONMENT_CERTIFICATION } from '../../admin/productionEnvironmentVerification';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const ORCHESTRATOR_REL = 'scripts/dataverse/run-full-activation-verification.ps1';
const SDK_REGEN_REL = 'scripts/dataverse/regenerate-powerapps-sdk.ps1';
const DOC_REL = 'docs/PHASE_244_POST_SCHEMA_PASS_EVIDENCE.md';

/**
 * Phase 244 — post-schema PASS evidence. CRM + portfolio technical prerequisites are
 * PASS after commit 0d5f303, but their live gates stay controlled and full launch is
 * still not achieved. The orchestrator must not report ALL-PASS while any domain is
 * BLOCKED/UNKNOWN, and the SDK regen must register singular logical table names.
 */
describe('Phase 244 — post-schema PASS evidence governance contract', () => {
  it('records CRM + portfolio environment PASS after commit 0d5f303', () => {
    expect(ENVIRONMENT_EVIDENCE_COMMIT).toBe('0d5f303');
    const vm = deriveFullProductionLaunchEvidence();
    const byKey = new Map(vm.domains.map((d) => [d.key, d]));
    expect(byKey.get('crmWriteback')?.environmentStatus).toBe('PASS');
    expect(byKey.get('portfolioBoarding')?.environmentStatus).toBe('PASS');
    expect(vm.environmentPassCount).toBe(6);
    // All six environments now PASS (Phase 250 Outlook connector + Phase 251 checklist signoff).
    expect(vm.blockingDomains).toEqual([]);
  });

  it('does NOT claim full launch — evidence insufficient (Launch Phase 5, enabledCount 1/6) even with every gate flipped', () => {
    // The certification toggles and live gate flags are all flipped on (structural state below
    // is unchanged), but launch truth derives from the committed final-launch smoke evidence
    // integrity, which is insufficient — so full launch stays not-achieved and only newDealCreate
    // (pilot-certified) is enabled. CRM + portfolio PASS the environment prerequisite but are
    // still NOT live because their final-launch smoke evidence is present-but-insufficient.
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
    const evidence = deriveFullProductionLaunchEvidence();
    expect(evidence.fullLaunchAchieved).toBe(false);

    const byKey = new Map(evidence.domains.map((d) => [d.key, d]));
    expect(byKey.get('crmWriteback')?.enabled).toBe(false);
    expect(byKey.get('portfolioBoarding')?.enabled).toBe(false);

    // Every domain is still certified and its live gate is still flipped — only the evidence
    // integrity withholds launch. These structural facts remain true.
    expect(PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate).toBe(true);
    expect(Object.values(PRODUCTION_ENVIRONMENT_CERTIFICATION).filter((v) => v === true)).toHaveLength(6);
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(true);
    expect(BORROWER_MESSAGING_ENABLED).toBe(true);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(true);
    expect(AUTO_STAGE_ADVANCE_ENABLED).toBe(true);
  });

  it('the orchestrator cannot report ALL-PASS while any child is BLOCKED/UNKNOWN', () => {
    const src = read(ORCHESTRATOR_REL);
    // It must capture the child host stream (the verifiers emit via Write-Host).
    expect(src).toMatch(/&\s*\$s\s*\*>&1/);
    // ALL-PASS requires at least one evidence line AND zero non-PASS lines.
    expect(src).toMatch(/\$allPass\s*=\s*\(\$evidence\.Count\s*-gt\s*0\)\s*-and\s*\(\$nonPass\.Count\s*-eq\s*0\)/);
    // The old vacuous form (no count guard) must be gone.
    expect(src).not.toMatch(/\$allPass\s*=\s*-not\s*\(\$evidence\s*\|/);
  });

  it('the SDK regen registers singular logical table names, not plural entity-set names', () => {
    const src = read(SDK_REGEN_REL);
    expect(src).toMatch(/\$_\.logicalName/);
    // The data-source registration loop must not pull the plural entity-set name.
    expect(src).not.toMatch(/\$entitySets\s*\+=\s*\(\$s\.tables\s*\|\s*ForEach-Object\s*\{\s*\$_\.entitySetName/);
  });

  it('no pac code push is INVOKED by the activation scripts (doc mentions are allowed)', () => {
    for (const rel of [ORCHESTRATOR_REL, SDK_REGEN_REL]) {
      const src = read(rel);
      // Catch an actual invocation (line-start, call operator, or RUN: prefix), not a
      // backtick-quoted mention inside a "does NOT run `pac code push`" comment.
      expect(src, rel).not.toMatch(/(?:^|&|RUN:)\s*pac\s+code\s+push/m);
    }
  });

  it('the Phase 244 doc records the honest post-schema state', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## Outcome',
      '## Recorded environment evidence',
      '## Script fixes',
      '## Remaining operator actions',
      '## Rollback plan',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/Full launch is NOT achieved/i);
    expect(doc).toMatch(/enabledCount\s*=\s*1\s*\/\s*6/);
    expect(doc).toMatch(/not performed/i);
  });
});
