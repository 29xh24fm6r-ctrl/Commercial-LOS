import { describe, expect, it } from 'vitest';
import { deriveProductionEnvironmentVerification } from '../../admin/productionEnvironmentVerification';
import { deriveFullActivationLaunchCertification } from '../../admin/fullActivationLaunchCertificationModel';
import {
  resolveReferenceReadiness,
  deriveNewDealReferenceReadiness,
} from '../../activation/newDealCreateActivation';
import {
  evaluateBankerCreateRollout,
  isBankerNewDealCreateLive,
} from '../../deals/bankerNewDealCreateRollout';
import {
  BANKER_CREATE_PILOT_ENABLED,
  BANKER_CREATE_PILOT,
  bankerCreatePilotGateValues,
} from '../../deals/bankerCreatePilotConfig';
import { BANKER_NEW_DEAL_CREATE_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';

/**
 * Phase 242A — Restore certified production New Deal create activation.
 *
 * New Deal create is restored to live based on recorded Phase 227/228A production
 * smoke evidence. It is restored the GOVERNANCE-PRESERVING way: through the approved
 * banker pilot switch (the established Phase 182B mechanism), NOT by flipping the
 * global create-gate constants — which stay false so the public/intake create
 * surface and every downstream automation remain provably off. Only New Deal create
 * is enabled; the other five live-write domains stay blocked and fail-closed.
 */

describe('Phase 242A — restore certified New Deal create activation', () => {
  it('enables all six domains: enabledCount=6, full launch achieved (Phase 256B)', () => {
    const verification = deriveProductionEnvironmentVerification();
    expect(verification.enabledCount).toBe(6);
    expect(verification.fullLaunchReady).toBe(true);
    expect(verification.domains.find((d) => d.key === 'newDealCreate')?.enabled).toBe(true);

    const model = deriveFullActivationLaunchCertification();
    expect(model.enabledCount).toBe(6);
    expect(model.fullLaunchAchieved).toBe(true);
    const byId = new Map(model.domains.map((d) => [d.id, d]));
    expect(byId.get('new-deal-create')?.status).toBe('enabled');
    for (const d of model.domains.filter((x) => x.id !== 'new-deal-create')) {
      expect(d.status, d.id).toBe('enabled');
    }
  });

  it('the other five live-write domains are now certified and live-enabled (Phase 256B)', () => {
    const verification = deriveProductionEnvironmentVerification();
    for (const d of verification.domains.filter((x) => x.key !== 'newDealCreate')) {
      expect(d.certified, d.key).toBe(true);
      expect(d.gateFlagOn, d.key).toBe(true);
      expect(d.enabled, d.key).toBe(true);
    }
  });

  it('restores create via the approved pilot WITHOUT flipping the global create-gate constants', () => {
    // Governance preserved: the global constants stay false (public + downstream off).
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);

    // Enablement flows through the pilot switch (one-line rollback).
    expect(BANKER_CREATE_PILOT_ENABLED).toBe(true);
    expect(bankerCreatePilotGateValues()).toEqual({ banker: true, adapter: true, intake: true });
  });

  it('is live-controlled for an authorized banker with approved production references', () => {
    const live = isBankerNewDealCreateLive({
      actorSystemUserId: 'sys-1',
      bankerAuthorized: true,
      resolverReady: true,
      productionReferencesApproved: BANKER_CREATE_PILOT.productionReferencesApproved,
      environmentIsProduction: BANKER_CREATE_PILOT.environmentIsProduction,
      productionRolloutApproved: BANKER_CREATE_PILOT.productionRolloutApproved,
      gateValues: bankerCreatePilotGateValues(),
    });
    expect(live).toBe(true);
  });

  it('TEST reference rows still cannot authorize a production create', () => {
    // Only an active TEST (non-production-approved) Stage row is present.
    const stage = resolveReferenceReadiness('Stage', [
      { id: 's-test', name: 'INTAKE-TEST', active: true, productionApproved: false },
    ]);
    expect(stage.kind).toBe('ready-test');
    expect(stage.resolvedProductionId).toBeNull();

    const refs = deriveNewDealReferenceReadiness({
      stageRows: [{ id: 's-test', name: 'INTAKE-TEST', active: true, productionApproved: false }],
      statusRows: [{ id: 'st-test', name: 'OPEN-TEST', active: true, productionApproved: false }],
    });
    expect(refs.productionReferencesApproved).toBe(false);

    // Even with the pilot gate values + authorized banker, unapproved references block the rollout.
    const state = evaluateBankerCreateRollout({
      actorSystemUserId: 'sys-1',
      bankerAuthorized: true,
      resolverReady: true,
      productionReferencesApproved: false,
      environmentIsProduction: true,
      productionRolloutApproved: true,
      gateValues: bankerCreatePilotGateValues(),
    });
    expect(state).toBe('references_not_approved');
  });

  it('production create still requires new_productionapproved=true references', () => {
    // An active but NOT production-approved row never resolves to ready-production.
    const notApproved = resolveReferenceReadiness('Stage', [
      { id: 's-1', name: 'INTAKE', active: true, productionApproved: false },
    ]);
    expect(notApproved.kind).not.toBe('ready-production');

    // The production-approved marker is what unlocks ready-production.
    const approved = resolveReferenceReadiness('Stage', [
      { id: 's-1', name: 'INTAKE', active: true, productionApproved: true },
    ]);
    expect(approved.kind).toBe('ready-production');
    expect(approved.resolvedProductionId).toBe('s-1');
  });
});
