import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateBankerCreateRollout } from '../../deals/bankerNewDealCreateRollout';
import { BANKER_NEW_DEAL_CREATE_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';

/**
 * PHASE 196 — V1 pilot enablement evidence certification contract.
 *
 * Evidence-certification ONLY: this phase defines/pins the evidence package,
 * redaction rules, safety invariants, and final V1.0 GO/NO-GO criteria for
 * accepting the Phase 195 controlled pilot cutover. It does NOT execute the live
 * pilot, flips NO gate, and adds NO product behaviour. These pins enforce that
 * posture and that the runbook documents the required evidence.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_196_V1_PILOT_ENABLEMENT_EVIDENCE_CERTIFICATION.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

// ---------------------------------------------------------------------------
// 1. Doc exists + prior docs present + snapshot tracks it.
// ---------------------------------------------------------------------------
describe('196 — evidence-certification doc exists and is tracked', () => {
  it('the Phase 196 doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });
  it('the Phase 195 cutover doc remains present', () => {
    expect(existsSync(resolve(ROOT, 'docs/PHASE_195_V1_CONTROLLED_PRODUCTION_PILOT_CUTOVER.md'))).toBe(true);
  });
  it('the release-candidate snapshot references the Phase 196 doc', () => {
    expect(SNAPSHOT).toMatch(/PHASE_196_V1_PILOT_ENABLEMENT_EVIDENCE_CERTIFICATION/);
  });
});

// ---------------------------------------------------------------------------
// 2. Evidence-certification-only / no-code-change posture.
// ---------------------------------------------------------------------------
describe('196 — evidence-certification-only posture', () => {
  it('declares it certifies evidence, is not the live pilot, and is not a feature build', () => {
    expect(DOC).toMatch(/evidence-certification only/i);
    expect(DOC).toMatch(/not the live pilot/i);
    expect(DOC).toMatch(/not a feature build/i);
  });

  it('declares the no-code / no-schema / no-migration / no-gate-flip posture', () => {
    expect(DOC).toMatch(/no production code change/i);
    expect(DOC).toMatch(/no schema change/i);
    expect(DOC).toMatch(/no migration/i);
    expect(DOC).toMatch(/no feature-flag flip|flips no gate/i);
  });

  it('the three global create gates remain false', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('the two pilot-UI gates remain false; generation is gated', () => {
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
  });

  it('evaluateBankerCreateRollout() still returns disabled by default', () => {
    expect(evaluateBankerCreateRollout()).toBe('disabled');
  });
});

// ---------------------------------------------------------------------------
// 3. Redaction + outside-repo storage policy.
// ---------------------------------------------------------------------------
describe('196 — redaction + evidence-vault policy', () => {
  it('requires real evidence to be stored outside the repository / in the evidence vault', () => {
    expect(DOC).toMatch(/outside the repository|outside repo/i);
    expect(DOC).toMatch(/evidence vault|release record/i);
  });

  it('forbids committing real GUIDs, URLs, secrets, customer/borrower names, screenshots, paths, and PII', () => {
    expect(DOC).toMatch(/real GUIDs/i);
    expect(DOC).toMatch(/environment URLs/i);
    expect(DOC).toMatch(/secrets/i);
    expect(DOC).toMatch(/access tokens/i);
    expect(DOC).toMatch(/customer names/i);
    expect(DOC).toMatch(/borrower names/i);
    expect(DOC).toMatch(/screenshots containing live customer data/i);
    expect(DOC).toMatch(/local user paths/i);
    expect(DOC).toMatch(/\bPII\b|personal information/);
  });

  it('provides the required redacted placeholders', () => {
    for (const ph of [
      '<system-user-id-redacted>',
      '<los-user-profile-id-redacted>',
      '<created-deal-id-redacted>',
      '<audit-event-id-redacted>',
      '<correlation-id-redacted>',
    ]) {
      expect(DOC).toContain(ph);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Required evidence inventories.
// ---------------------------------------------------------------------------
describe('196 — required evidence inventories', () => {
  it('lists required pilot identity evidence', () => {
    expect(DOC).toMatch(/pilot identity evidence/i);
    expect(DOC).toMatch(/System User id/i);
    expect(DOC).toMatch(/LOS User Profile id/i);
    expect(DOC).toMatch(/rollback owner/i);
    expect(DOC).toMatch(/approval owner/i);
  });

  it('lists controlled pilot switch evidence (gates not flipped)', () => {
    expect(DOC).toMatch(/controlled pilot switch evidence/i);
    expect(DOC).toMatch(/BANKER_CREATE_PILOT_ENABLED/);
    expect(DOC).toMatch(/BANKER_NEW_DEAL_CREATE_ENABLED/);
    expect(DOC).toMatch(/NEW_DEAL_CREATE_ADAPTER_ENABLED/);
    expect(DOC).toMatch(/NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED/);
  });

  it('lists live New Deal create evidence and requires the deal to open in /deals/:dealId', () => {
    expect(DOC).toMatch(/live New Deal create evidence/i);
    expect(DOC).toMatch(/\/deals\/:dealId/);
    expect(DOC).toMatch(/required-field validation/i);
    expect(DOC).toMatch(/one controlled live New Deal/i);
  });

  it('audit evidence requires the cr664_user bind and forbids /systemusers', () => {
    expect(DOC).toMatch(/\/cr664_users\(<CoreUser>\)/);
    expect(DOC).toMatch(/\/systemusers/);
    expect(DOC).toMatch(/audit_failed_partial|partially failed/i);
  });

  it('negative evidence covers comms, checklist gen, CRM writeback, fake data, and duplicate create', () => {
    expect(DOC).toMatch(/no borrower communication|no borrower comms/i);
    expect(DOC).toMatch(/no checklist generation/i);
    expect(DOC).toMatch(/no CRM writeback/i);
    expect(DOC).toMatch(/no fake \/ sample \/ demo data|no fake\/sample\/demo data/i);
    expect(DOC).toMatch(/no duplicate deal|duplicate deal/i);
    expect(DOC).toMatch(/allow-list/i);
  });

  it('requires rollback evidence', () => {
    expect(DOC).toMatch(/rollback evidence/i);
    expect(DOC).toMatch(/rollback was tested|retained as a ready procedure/i);
    expect(DOC).toMatch(/existing created deal remained accessible/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Stop conditions + GO/NO-GO + verification commands.
// ---------------------------------------------------------------------------
describe('196 — stop conditions + GO/NO-GO + verification', () => {
  it('stop conditions enumerate the key NO-GO triggers', () => {
    expect(DOC).toMatch(/Unauthorized user can create a deal/i);
    expect(DOC).toMatch(/fields outside the certified allow-list/i);
    expect(DOC).toMatch(/\/systemusers/);
    expect(DOC).toMatch(/Borrower communication is sent/i);
    expect(DOC).toMatch(/Checklist generation occurs/i);
    expect(DOC).toMatch(/CRM writeback occurs/i);
    expect(DOC).toMatch(/Duplicate deal is created/i);
    expect(DOC).toMatch(/Fake \/ sample \/ demo data appears|Fake\/sample\/demo data appears/i);
    expect(DOC).toMatch(/Created deal cannot be opened/i);
    expect(DOC).toMatch(/Audit evidence is missing or unreconciled/i);
  });

  it('records V1.0 GO and NO-GO criteria', () => {
    expect(DOC).toMatch(/Final V1\.0 GO criteria/i);
    expect(DOC).toMatch(/Final V1\.0 NO-GO criteria/i);
    expect(DOC).toMatch(/release operator signed off/i);
    expect(DOC).toMatch(/stored outside repo/i);
  });

  it('includes the verification commands', () => {
    expect(DOC).toMatch(/git status --short/);
    expect(DOC).toMatch(/git diff --check/);
    expect(DOC).toMatch(/phase196V1PilotEnablementEvidenceCertification releaseCandidateSnapshot/);
    expect(DOC).toMatch(/npm --prefix code-app run build/);
  });
});
