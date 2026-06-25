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
  it('the five committed artifacts all load and validate as GO', () => {
    const loaded = loadFinalLaunchSmokeRecords(ROOT);
    expect(loaded.errors).toEqual([]);
    expect(loaded.records.map((r) => r.capability).sort()).toEqual([...FINAL_LAUNCH_CAPABILITIES].sort());
    const r = deriveFinalLaunchReadiness({ records: loaded.records });
    expect(r.allCapabilitiesGo).toBe(true);
    expect(r.capabilities.every((c) => c.smokeGo)).toBe(true);
    expect(r.crmHydrated).toBe(true);
    expect(r.portfolioHydrated).toBe(true);
    expect(r.deploymentAllowed).toBe(true);
    expect(r.projectedEnabledCount).toBe(6);
    expect(r.projectedFullLaunchAchieved).toBe(true);
  });

  it('with the gates flipped, the real verification is fully launched (6/6, deployment allowed)', () => {
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(6);
    expect(verification.allCertified).toBe(true);
    expect(verification.fullLaunchReady).toBe(true);

    const cutover = deriveControlledLiveCutoverReadiness();
    // Full launch achieved, all six enabled, all three controlled cutovers complete (stage is
    // not schema-gated — its readiness is the sink/ordering contract + recorded smoke).
    expect(cutover.fullLaunchAchieved).toBe(true);
    expect(cutover.enabledCount).toBe(6);
    expect(cutover.deploymentAllowed).toBe(true);
    expect(cutover.cutoverCompleteCount).toBe(3);

    const ledger = deriveFullProductionLaunchEvidence();
    expect(ledger.enabledCount).toBe(6);
    expect(ledger.fullLaunchAchieved).toBe(true);
    expect(ledger.blockingDomains).toEqual([]);
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
