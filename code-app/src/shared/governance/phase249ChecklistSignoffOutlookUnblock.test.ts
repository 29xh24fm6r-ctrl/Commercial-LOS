// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveChecklistSignoffReadiness, CHECKLIST_RULESET_SIGNOFF } from '../../admin/checklistSignoffEvidence';
import { deriveOutlookConnectorReadiness, detectOutlookConnectorRegistration, OUTLOOK_CONNECTOR_STATE, OUTLOOK_GENERATED_SERVICE_PATH } from '../../admin/outlookConnectorEvidence';
import { deriveFullProductionLaunchEvidence } from '../../admin/fullProductionLaunchEvidence';
import { derivePacTableAccessReadiness } from '../../admin/pacTableAccessEvidence';
import {
  hydrateVerifiedCrmSchemaState,
  hydrateVerifiedBoardingSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
} from '../../admin/runtimeVerifiedSchemaBridge';
import { deriveProductionEnvironmentVerification } from '../../admin/productionEnvironmentVerification';
import { CHECKLIST_WRITE_ENABLED } from '../../activation/checklistGenerationActivation';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const DOC_REL = 'docs/PHASE_249_CHECKLIST_SIGNOFF_AND_OUTLOOK_CONNECTOR_UNBLOCK.md';

describe('Phase 249 — checklist signoff + Outlook connector governance contract', () => {
  it('fabricates no checklist signoff (committed null → UNKNOWN, gates false)', () => {
    expect(CHECKLIST_RULESET_SIGNOFF).toBeNull();
    const vm = deriveChecklistSignoffReadiness();
    expect(vm.status).toBe('UNKNOWN');
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(CHECKLIST_WRITE_ENABLED).toBe(false);
    // The committed source records no signoff value.
    const src = read('src/admin/checklistSignoffEvidence.ts');
    expect(src).toMatch(/CHECKLIST_RULESET_SIGNOFF:\s*ChecklistRulesetSignoff\s*\|\s*null\s*=\s*null/);
  });

  it('Outlook connector registered via power.config.json (real) → PASS, but live send stays gated', () => {
    // Phase 250: registration is REAL (power.config.json), not fabricated; gates stay false.
    expect(OUTLOOK_CONNECTOR_STATE.connectorRegisteredInManifest).toBe(true);
    expect(OUTLOOK_CONNECTOR_STATE.emailModeLive).toBe(false);
    const vm = deriveOutlookConnectorReadiness();
    expect(vm.status).toBe('PASS');
    expect(vm.liveSendEnabled).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(false);
    // The generated service genuinely exists, and the real power.config.json carries the registration.
    expect(existsSync(resolve(ROOT, OUTLOOK_GENERATED_SERVICE_PATH))).toBe(true);
    expect(detectOutlookConnectorRegistration(read('power.config.json'))).toBe(true);
  });

  it('does NOT alter CRM/portfolio runtime hydration (still fails closed)', () => {
    expect(hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated).toBe(false);
    expect(hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated).toBe(false);
    expect(derivePacTableAccessReadiness().runtimeHydrated).toBe(false);
  });

  it('the ledger keeps checklist UNKNOWN (borrower connector now PASS) and does not claim launch', () => {
    const ledger = deriveFullProductionLaunchEvidence();
    const byKey = new Map(ledger.domains.map((d) => [d.key, d]));
    expect(byKey.get('documentChecklist')?.environmentStatus).toBe('UNKNOWN');
    // Phase 250: connector registered → borrowerSend environment PASS (still not live-enabled).
    expect(byKey.get('borrowerSend')?.environmentStatus).toBe('PASS');
    expect(byKey.get('borrowerSend')?.enabled).toBe(false);
    expect(byKey.get('newDealCreate')?.enabled).toBe(true);
    expect(byKey.get('crmWriteback')?.environmentStatus).toBe('PASS');
    expect(byKey.get('portfolioBoarding')?.environmentStatus).toBe('PASS');
    expect(ledger.blockingDomains).toEqual(['documentChecklist']);
    expect(ledger.enabledCount).toBe(1);
    expect(ledger.fullLaunchAchieved).toBe(false);

    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1);
    expect(verification.fullLaunchReady).toBe(false);
  });

  it('the Phase 249 doc has the signoff pack + Outlook runbook sections', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    const doc = read(DOC_REL);
    for (const section of [
      '## Document checklist signoff pack',
      '## Outlook connector registration runbook',
      '## Verification commands',
      '## Exact operator actions remaining',
    ]) {
      expect(doc, section).toContain(section);
    }
    expect(doc).toMatch(/not performed/i);
    expect(doc).toMatch(/UNKNOWN/);
  });
});
