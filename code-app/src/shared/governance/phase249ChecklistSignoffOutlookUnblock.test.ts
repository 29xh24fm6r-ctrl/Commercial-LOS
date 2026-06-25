// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveChecklistSignoffReadiness,
  parseChecklistSignoffArtifact,
  CHECKLIST_RULESET_SIGNOFF,
  CHECKLIST_SIGNOFF_ARTIFACT_PATH,
} from '../../admin/checklistSignoffEvidence';
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
  it('consumes the recorded checklist signoff (Phase 251) → SIGNED, and the live gate is now flipped (Phase 256B)', () => {
    expect(CHECKLIST_RULESET_SIGNOFF).not.toBeNull();
    const vm = deriveChecklistSignoffReadiness();
    expect(vm.status).toBe('SIGNED');
    // Phase 256B: the live checklist gates are now flipped after the GO smoke.
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(true);
    expect(CHECKLIST_WRITE_ENABLED).toBe(true);
    expect(vm.gateFlipBlocked).toBe(true);
    // The signoff is grounded in a real committed artifact, not fabricated.
    expect(existsSync(resolve(ROOT, CHECKLIST_SIGNOFF_ARTIFACT_PATH))).toBe(true);
    expect(parseChecklistSignoffArtifact(read(CHECKLIST_SIGNOFF_ARTIFACT_PATH))).not.toBeNull();
  });

  it('Outlook connector registered via power.config.json (real) → PASS, and live send is now enabled (Phase 256B)', () => {
    // Phase 250: registration is REAL (power.config.json), not fabricated. Phase 256B flips the gates.
    expect(OUTLOOK_CONNECTOR_STATE.connectorRegisteredInManifest).toBe(true);
    expect(OUTLOOK_CONNECTOR_STATE.emailModeLive).toBe(false);
    const vm = deriveOutlookConnectorReadiness();
    expect(vm.status).toBe('PASS');
    expect(vm.liveSendEnabled).toBe(true);
    expect(BORROWER_MESSAGING_ENABLED).toBe(true);
    expect(BORROWER_EMAIL_TRANSPORT_ENABLED).toBe(true);
    // The generated service genuinely exists, and the real power.config.json carries the registration.
    expect(existsSync(resolve(ROOT, OUTLOOK_GENERATED_SERVICE_PATH))).toBe(true);
    expect(detectOutlookConnectorRegistration(read('power.config.json'))).toBe(true);
  });

  it('does NOT alter CRM/portfolio runtime hydration (both hydrate from their own full token-backed schema)', () => {
    // The checklist/Outlook work does not touch CRM/portfolio hydration: CRM hydrates from its
    // full metadata (Phase 253C), portfolio from its full build (219/12, Phase 255B).
    expect(hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    expect(hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE).hydrated).toBe(true);
    expect(derivePacTableAccessReadiness().runtimeHydrated).toBe(true);
  });

  it('the ledger marks checklist + borrower environments PASS and now claims full launch (Phase 256B)', () => {
    const ledger = deriveFullProductionLaunchEvidence();
    const byKey = new Map(ledger.domains.map((d) => [d.key, d]));
    // Phase 251: signoff recorded → documentChecklist environment PASS; Phase 256B enables it.
    expect(byKey.get('documentChecklist')?.environmentStatus).toBe('PASS');
    expect(byKey.get('documentChecklist')?.enabled).toBe(true);
    // Phase 250: connector registered → borrowerSend environment PASS; Phase 256B enables it.
    expect(byKey.get('borrowerSend')?.environmentStatus).toBe('PASS');
    expect(byKey.get('borrowerSend')?.enabled).toBe(true);
    expect(byKey.get('newDealCreate')?.enabled).toBe(true);
    expect(byKey.get('crmWriteback')?.environmentStatus).toBe('PASS');
    expect(byKey.get('portfolioBoarding')?.environmentStatus).toBe('PASS');
    expect(ledger.blockingDomains).toEqual([]);
    expect(ledger.enabledCount).toBe(6);
    expect(ledger.fullLaunchAchieved).toBe(true);

    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(6);
    expect(verification.fullLaunchReady).toBe(true);
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
