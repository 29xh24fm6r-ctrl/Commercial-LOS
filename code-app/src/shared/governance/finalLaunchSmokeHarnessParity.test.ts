import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { committedFinalLaunchEvidenceIntegrity } from '../../access/committedFinalLaunchEvidence';
import type { FinalLaunchCapability } from '../../access/finalLaunchSmokeEvidence';

/**
 * Gate-flip safety pin — the operator smoke harness and the evidence-integrity gate
 * must agree on what "passed" means.
 *
 * The TypeScript gate (deriveEvidenceIntegrity) is the single acceptance authority: a
 * capability is GO only when its artifact is shape-GO AND attributed to a real operator
 * UPN AND carries class-appropriate machine proof (AUTOMATED_CRUD → affectedRecordIds;
 * EXTERNAL_SEND → deliveryReceiptId + approvedRecipient + approverUpn).
 *
 * The PowerShell recorder (scripts/dataverse/run-final-launch-smokes.ps1) previously
 * accepted a borrowerSend record carrying only a deliveryVerified/auditVerified boolean
 * — so an operator could record an artifact that reads "passed" yet the gate rejects as
 * EVIDENCE_INSUFFICIENT. That is a gate-flip trap. Test-ManualEvidence now enforces the
 * same acceptance predicate for any outcome=passed record, so the recorder can never
 * mint a passed artifact the gate will silently reject.
 *
 * These tests keep the two validators from drifting apart again.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = readFileSync(resolve(REPO_ROOT, 'scripts/dataverse/run-final-launch-smokes.ps1'), 'utf8');

describe('final-launch smoke harness ↔ evidence-integrity gate parity', () => {
  it('the committed artifacts grade exactly as the gate authority says (no inferred passes)', () => {
    const integ = committedFinalLaunchEvidenceIntegrity();
    // crmLivePersistence is the one accepted-HIGH artifact (real record id, attributable
    // UPN, non-synthetic clock). Everything else is present-but-insufficient today.
    expect(integ.crmLivePersistence?.accepted).toBe(true);
    expect(integ.crmLivePersistence?.confidence).toBe('HIGH');
    const insufficient: FinalLaunchCapability[] = ['portfolioBoarding', 'documentChecklist', 'borrowerSend', 'stageAdvancement'];
    for (const cap of insufficient) {
      expect(integ[cap]?.accepted, `${cap} must not be accepted with placeholder evidence`).toBe(false);
    }
  });

  it('the PowerShell recorder enforces machine proof for any outcome=passed record', () => {
    // Guard the acceptance-parity block so it cannot be silently removed.
    expect(HARNESS).toMatch(/\$e\.outcome\s+-eq\s+'passed'/);
    expect(HARNESS).toMatch(/Test-AttributableUpn/);
    expect(HARNESS).toMatch(/\$SENTINEL_UPNS/);
    // EXTERNAL_SEND machine proof.
    expect(HARNESS).toMatch(/deliveryReceiptId/);
    expect(HARNESS).toMatch(/approvedRecipient/);
    expect(HARNESS).toMatch(/approverUpn/);
    // AUTOMATED_CRUD machine proof.
    expect(HARNESS).toMatch(/affectedRecordIds/);
    expect(HARNESS).toMatch(/Test-HasId/);
  });

  it('the sentinel operator list matches the TypeScript authority (no attributable gap)', () => {
    for (const sentinel of ['unknown-operator', 'system', 'service-account', '00000000-0000-0000-0000-000000000000']) {
      expect(HARNESS).toMatch(new RegExp(sentinel.replace(/[-]/g, '\\-')));
    }
  });
});
