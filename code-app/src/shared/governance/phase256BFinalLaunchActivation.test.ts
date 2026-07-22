// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadFinalLaunchSmokeRecords } from '../../access/finalLaunchSmokeEvidenceLoader';
import { FINAL_LAUNCH_CAPABILITIES } from '../../access/finalLaunchSmokeEvidence';
import { deriveFinalLaunchReadiness } from '../../activation/finalLaunchReadiness';
import { deriveProductionEnvironmentVerification } from '../../admin/productionEnvironmentVerification';
import { deriveControlledLiveCutoverReadiness } from '../../admin/controlledLiveCutoverReadiness';
import { deriveFullProductionLaunchEvidence } from '../../admin/fullProductionLaunchEvidence';

const ROOT = resolve(__dirname, '..', '..', '..');

describe('Phase 256B — consume final-launch smoke evidence + verify launch', () => {
  it('the five committed artifacts load structurally but are integrity-INSUFFICIENT (Phase 1 hardening)', () => {
    const loaded = loadFinalLaunchSmokeRecords(ROOT);
    expect(loaded.errors).toEqual([]); // still structurally parseable
    expect(loaded.records.map((r) => r.capability).sort()).toEqual([...FINAL_LAUNCH_CAPABILITIES].sort());
    const r = deriveFinalLaunchReadiness({ records: loaded.records });
    // CRM-K: crmLivePersistence is GO (attributed re-capture); Workstream K additionally
    // re-captured a real portfolioBoarding smoke that is also now GO. The other three remain
    // integrity-insufficient (missing machine proof / no receipt).
    expect(r.allCapabilitiesGo).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'crmLivePersistence')?.evidenceInsufficient).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'portfolioBoarding')?.evidenceInsufficient).toBe(false);
    expect(
      r.capabilities
        .filter((c) => c.capability !== 'crmLivePersistence' && c.capability !== 'portfolioBoarding')
        .every((c) => c.evidenceInsufficient),
    ).toBe(true);
    expect(r.crmHydrated).toBe(true);
    expect(r.portfolioHydrated).toBe(true);
    expect(r.deploymentAllowed).toBe(false);
    // CRM-K: New Deal create + crmLivePersistence + portfolioBoarding (all now GO via attributed
    // re-capture) project enabled; their actual enablement still awaits only their gate-flag
    // flips (deployment withheld).
    expect(r.projectedEnabledCount).toBe(3);
  });

  it('Phase 5: every launch projection is gated on integrity — committed evidence insufficient → not launched (1/6)', () => {
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(1); // only New Deal create (pilot-certified)
    expect(verification.allCertified).toBe(true); // operator toggles unchanged; evidence gates enabled
    expect(verification.fullLaunchReady).toBe(false);

    const cutover = deriveControlledLiveCutoverReadiness();
    expect(cutover.fullLaunchAchieved).toBe(false);
    expect(cutover.enabledCount).toBe(1);
    expect(cutover.deploymentAllowed).toBe(false);
    expect(cutover.cutoverCompleteCount).toBe(0);

    const ledger = deriveFullProductionLaunchEvidence();
    expect(ledger.enabledCount).toBe(1);
    expect(ledger.fullLaunchAchieved).toBe(false);
    expect(ledger.blockingDomains).toEqual([]); // environment prerequisites still all PASS
  });

  it('fail-closed: removing or failing any one smoke withholds deployment', () => {
    const loaded = loadFinalLaunchSmokeRecords(ROOT);
    // Remove borrowerSend → blocked.
    const missing = loaded.records.filter((r) => r.capability !== 'borrowerSend');
    expect(deriveFinalLaunchReadiness({ records: missing }).deploymentAllowed).toBe(false);
    // Fail CRM → blocked.
    const failed = loaded.records.map((r) => (r.capability === 'crmLivePersistence' ? { ...r, outcome: 'failed' as const } : r));
    expect(deriveFinalLaunchReadiness({ records: failed }).deploymentAllowed).toBe(false);
    // Strip borrower delivery/audit → borrower blocked.
    const noDelivery = loaded.records.map((r) =>
      r.capability === 'borrowerSend' ? { ...r, deliveryVerified: false, auditVerified: false } : r,
    );
    const r = deriveFinalLaunchReadiness({ records: noDelivery });
    expect(r.capabilities.find((c) => c.capability === 'borrowerSend')?.smokeGo).toBe(false);
    expect(r.deploymentAllowed).toBe(false);
  });
});
