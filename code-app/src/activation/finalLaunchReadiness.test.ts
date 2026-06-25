// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deriveFinalLaunchReadiness } from './finalLaunchReadiness';
import {
  FINAL_LAUNCH_CAPABILITIES,
  type FinalLaunchCapability,
  type FinalLaunchSmokeEvidence,
} from '../access/finalLaunchSmokeEvidence';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import {
  AUTO_STAGE_ADVANCE_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
} from '../deals/dealOriginationFeatureFlags';

function validRecord(capability: FinalLaunchCapability, over: Partial<FinalLaunchSmokeEvidence> = {}): FinalLaunchSmokeEvidence {
  const base: FinalLaunchSmokeEvidence = {
    capability,
    outcome: 'passed',
    operatorUpn: 'mpaller@oldglorybank.com',
    environmentUrl: 'https://org3a57b8d4.crm.dynamics.com/',
    environmentId: '5f2d77a5-de50-edeb-9d74-5b2400a2320d',
    correlationId: `corr-${capability}`,
    startedAtIso: '2026-06-25T17:00:00.000Z',
    completedAtIso: '2026-06-25T17:00:30.000Z',
    liveOperationPerformed: true,
    readbackVerified: true,
    rollbackVerified: true,
    evidenceNote: 'controlled launch-test smoke',
  };
  if (capability === 'borrowerSend') return { ...base, rollbackVerified: false, deliveryVerified: true, auditVerified: true, ...over };
  return { ...base, ...over };
}

const allFiveValid = () => FINAL_LAUNCH_CAPABILITIES.map((c) => validRecord(c));

describe('Phase 256A — final-launch readiness projection', () => {
  it('with NO artifacts: deployment withheld; current enabledCount stays 1/6, fullLaunch false', () => {
    const r = deriveFinalLaunchReadiness({ records: [] });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.allCapabilitiesGo).toBe(false);
    expect(r.capabilities.every((c) => !c.smokeGo && c.blockReason)).toBe(true);
    expect(r.currentEnabledCount).toBe(1);
    expect(r.currentFullLaunchAchieved).toBe(false);
    expect(r.projectedEnabledCount).toBe(1); // only New Deal
  });

  it('backend is hydrated (CRM + portfolio) — the prerequisite for deployment', () => {
    const r = deriveFinalLaunchReadiness({ records: [] });
    expect(r.crmHydrated).toBe(true);
    expect(r.portfolioHydrated).toBe(true);
    expect(r.backendReady).toBe(true);
    expect(r.newDealCertified).toBe(true);
  });

  it('with VALID artifacts for all five: deploymentAllowed true and projection reaches 6/6 — but real gates stay off', () => {
    const r = deriveFinalLaunchReadiness({ records: allFiveValid() });
    expect(r.allCapabilitiesGo).toBe(true);
    expect(r.deploymentAllowed).toBe(true);
    expect(r.projectedEnabledCount).toBe(6);
    expect(r.projectedFullLaunchAchieved).toBe(true);
    // CRITICAL: the projection does NOT flip gates — the real state is unchanged.
    expect(r.currentEnabledCount).toBe(1);
    expect(r.currentFullLaunchAchieved).toBe(false);
  });

  it('a single failed/missing artifact blocks that capability and withholds deployment', () => {
    const withOneFailed = allFiveValid().map((rec) =>
      rec.capability === 'stageAdvancement' ? { ...rec, outcome: 'failed' as const } : rec,
    );
    const r = deriveFinalLaunchReadiness({ records: withOneFailed });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'stageAdvancement')?.smokeGo).toBe(false);
    expect(r.capabilities.filter((c) => c.smokeGo).length).toBe(4);
    expect(r.projectedEnabledCount).toBe(5);

    // A missing artifact (only four supplied) also withholds deployment.
    const fourOnly = allFiveValid().filter((rec) => rec.capability !== 'borrowerSend');
    const r2 = deriveFinalLaunchReadiness({ records: fourOnly });
    expect(r2.deploymentAllowed).toBe(false);
    expect(r2.capabilities.find((c) => c.capability === 'borrowerSend')?.present).toBe(false);
  });

  it('a borrowerSend smoke without delivery/audit verification is blocked', () => {
    const records = allFiveValid().map((rec) =>
      rec.capability === 'borrowerSend' ? { ...rec, deliveryVerified: false, auditVerified: false } : rec,
    );
    const r = deriveFinalLaunchReadiness({ records });
    expect(r.deploymentAllowed).toBe(false);
    expect(r.capabilities.find((c) => c.capability === 'borrowerSend')?.smokeGo).toBe(false);
  });

  it('this module flips NO live gate constant', () => {
    expect(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(BORROWER_MESSAGING_ENABLED).toBe(false);
    expect(AUTO_STAGE_ADVANCE_ENABLED).toBe(false);
  });
});
