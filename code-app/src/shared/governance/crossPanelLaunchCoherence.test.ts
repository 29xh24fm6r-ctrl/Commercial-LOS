// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  deriveProductionEnvironmentVerification,
  type ActivationDomainKey,
} from '../../admin/productionEnvironmentVerification';
import { deriveFullActivationLaunchCertification } from '../../admin/fullActivationLaunchCertificationModel';
import { deriveControlledLiveCutoverReadiness } from '../../admin/controlledLiveCutoverReadiness';
import { deriveFullProductionLaunchEvidence } from '../../admin/fullProductionLaunchEvidence';
import { deriveV1ActivationReadiness } from '../../shared/readiness/v1ActivationReadinessModel';
import { deriveOgbCrmWorkflowActivation } from '../../admin/ogbCrmWorkflowActivationModel';
import { deriveEliteCrmLosActivationReadiness } from '../../admin/eliteCrmLosActivationReadinessModel';
import { deriveManagerOperatingCommandCenterModel } from '../../manager/managerOperatingCommandCenterModel';
import { deriveExecutiveRestartReadinessModel } from '../../executive/executiveRestartReadinessModel';
import { CRM_LIVE_PERSISTENCE_DEFAULT } from '../../admin/adminCrmOnboardingModel';
import { PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT } from '../../admin/adminPortfolioBoardingModel';

/**
 * Completion Phase B — cross-panel launch coherence guard.
 *
 * Several panels/models derive a per-domain "live/enabled/active" status INDEPENDENTLY from
 * feature-flag constants, not from the single launch authority
 * (`deriveProductionEnvironmentVerification()`, whose `.enabled = certified && gateFlagOn &&
 * evidenceHigh`). This guard fails — in BOTH directions — if any panel disagrees with the
 * authority for a live-write domain:
 *   - a panel reporting a domain LIVE while the authority says not-enabled (the split-brain the
 *     pre-flipped flags caused), AND
 *   - a panel reporting a domain GATED while the authority says enabled.
 *
 * Because the authority additionally requires HIGH evidence, this permanently catches the
 * dangerous case "a flag is re-armed without authentic evidence" — the flag-reading panel would
 * flip to live while the authority (evidence insufficient) stays not-enabled → this test fails.
 */

const LIVE_WRITE_DOMAINS: readonly ActivationDomainKey[] = [
  'crmWriteback',
  'documentChecklist',
  'borrowerSend',
  'stageAdvancement',
  'portfolioBoarding',
];

function authorityEnabled(): Record<ActivationDomainKey, boolean> {
  const v = deriveProductionEnvironmentVerification();
  return Object.fromEntries(v.domains.map((d) => [d.key, d.enabled])) as Record<ActivationDomainKey, boolean>;
}

/** Each panel/model → the subset of live-write domains it reports + how to read "live" from it. */
function panelLiveStatus(): Record<string, Partial<Record<ActivationDomainKey, boolean>>> {
  const fullAct = deriveFullActivationLaunchCertification();
  const fa = (id: string) => fullAct.domains.find((d) => d.id === id)?.status === 'enabled';

  const v1 = deriveV1ActivationReadiness();
  const ogb = deriveOgbCrmWorkflowActivation();

  const elite = deriveEliteCrmLosActivationReadiness();
  const el = (id: string) => elite.domains.find((d) => d.id === id)?.state === 'ready';

  const manager = deriveManagerOperatingCommandCenterModel();
  const mg = (id: string) => manager.domains.find((d) => d.id === id)?.state === 'operational';

  const cutover = deriveControlledLiveCutoverReadiness();
  const co = (key: ActivationDomainKey) => cutover.domains.find((d) => d.key === key)?.enabled === true;

  const evidence = deriveFullProductionLaunchEvidence();
  const ev = (key: ActivationDomainKey) => evidence.domains.find((d) => d.key === key)?.enabled === true;

  return {
    'Full Activation Launch Certification': {
      crmWriteback: fa('crm-writeback'),
      documentChecklist: fa('document-checklist-generation'),
      borrowerSend: fa('borrower-communication-send'),
      stageAdvancement: fa('stage-advancement'),
      portfolioBoarding: fa('portfolio-boarding-persistence'),
    },
    'V1 Activation Readiness': {
      crmWriteback: v1.crmWriteback === 'ENABLED',
      documentChecklist: v1.checklistGeneration === 'ENABLED',
      borrowerSend: v1.borrowerCommunications === 'ENABLED',
    },
    'OGB CRM & Workflow Activation': {
      crmWriteback: ogb.writebackStatus === 'enabled',
      documentChecklist: ogb.checklistGenerationStatus === 'enabled',
      borrowerSend: ogb.borrowerCommunicationStatus === 'enabled',
    },
    'Elite CRM + LOS Activation Readiness': {
      crmWriteback: el('crm-writeback'),
      documentChecklist: el('document-checklist'),
      portfolioBoarding: el('portfolio-boarding'),
    },
    // Factory Arc Phase 2/3 retired the Banker Operating Command Center's per-capability
    // gate/domain concept entirely (see bankerOperatingCommandCenterModel.ts) — it no longer
    // reports a "live/gated" status for any domain, so it has nothing to compare against the
    // authority here. The Manager panel (out of scope for this phase) still does.
    'Manager Operating Command Center': {
      crmWriteback: mg('crm-writeback'),
      documentChecklist: mg('document-readiness'),
      borrowerSend: mg('borrower-communication'),
      portfolioBoarding: mg('portfolio-boarding'),
    },
    // Factory Arc Phase 14 — the executive restart readiness model reports
    // per-category gate status via `gatedActivationCategories` (the NOT-yet-
    // enabled category labels) rather than a per-domain state field; a
    // category is "live" when its label is absent from that list.
    'Executive Restart Readiness Command Center': (() => {
      const exec = deriveExecutiveRestartReadinessModel();
      const gated = new Set(exec.gatedActivationCategories);
      return {
        crmWriteback: !gated.has('CRM writeback / live persistence'),
        documentChecklist: !gated.has('Document checklist generation'),
        borrowerSend: !gated.has('Borrower communication send'),
        portfolioBoarding: !gated.has('Portfolio boarding live persistence'),
      };
    })(),
    'CRM Onboarding Admin Panel': {
      crmWriteback: CRM_LIVE_PERSISTENCE_DEFAULT === true,
    },
    'Portfolio Boarding Admin Panel': {
      portfolioBoarding: PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT === true,
    },
    'Controlled Live Cutover Readiness': {
      crmWriteback: co('crmWriteback'),
      portfolioBoarding: co('portfolioBoarding'),
      stageAdvancement: co('stageAdvancement'),
    },
    'Full Production Launch Evidence': {
      crmWriteback: ev('crmWriteback'),
      documentChecklist: ev('documentChecklist'),
      borrowerSend: ev('borrowerSend'),
      stageAdvancement: ev('stageAdvancement'),
      portfolioBoarding: ev('portfolioBoarding'),
    },
  };
}

describe('Completion Phase B — cross-panel launch coherence (both directions)', () => {
  it('every panel agrees with the authority on each live-write domain it reports', () => {
    const auth = authorityEnabled();
    const panels = panelLiveStatus();
    const mismatches: string[] = [];
    for (const [panel, statuses] of Object.entries(panels)) {
      for (const domain of LIVE_WRITE_DOMAINS) {
        const reported = statuses[domain];
        if (reported === undefined) continue; // panel does not cover this domain
        if (reported !== auth[domain]) {
          mismatches.push(`${panel} reports ${domain}=${reported ? 'LIVE' : 'gated'} but authority enabled=${auth[domain]}`);
        }
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });

  it('against the committed state every live-write domain is not-enabled everywhere (1/6 posture)', () => {
    const auth = authorityEnabled();
    for (const d of LIVE_WRITE_DOMAINS) expect(auth[d], d).toBe(false);
    const panels = panelLiveStatus();
    for (const [panel, statuses] of Object.entries(panels)) {
      for (const domain of LIVE_WRITE_DOMAINS) {
        if (statuses[domain] !== undefined) expect(statuses[domain], `${panel}.${domain}`).toBe(false);
      }
    }
  });

  it('the coherence check actually detects a divergence (guard is not vacuous, both directions)', () => {
    // Prove the equality comparison flags BOTH split-brain directions, so a real future
    // divergence (e.g. a flag re-armed without evidence) cannot pass silently.
    const auth = authorityEnabled(); // crmWriteback enabled === false
    const detect = (reported: boolean, key: ActivationDomainKey) => reported !== auth[key];
    // Direction 1: panel says LIVE while authority says not-enabled → detected.
    expect(detect(true, 'crmWriteback')).toBe(true);
    // Direction 2: panel says gated while authority says enabled → detected.
    expect(detect(false, 'newDealCreate')).toBe(true);
    // Agreement → not flagged.
    expect(detect(false, 'crmWriteback')).toBe(false);
    expect(detect(true, 'newDealCreate')).toBe(false);
  });

  it('New Deal create is the one enabled domain, and the pilot-reading surfaces agree', () => {
    const auth = authorityEnabled();
    expect(auth.newDealCreate).toBe(true); // pilot-certified
    // Surfaces that read the PILOT switch report it enabled (matching the authority).
    expect(deriveV1ActivationReadiness().newDealCreatePilot).toBe('ENABLED');
    expect(deriveOgbCrmWorkflowActivation().pilotCreateStatus).toBe('enabled');
    expect(
      deriveFullActivationLaunchCertification().domains.find((d) => d.id === 'new-deal-create')?.status,
    ).toBe('enabled');
    // Factory Arc Phase 11 — the Manager Operating Command Center's
    // new-deal-intake domain now reads the same real pilot switch
    // (BANKER_CREATE_PILOT_ENABLED) instead of a dead legacy constant, so it
    // must agree with the authority too, exactly like the other pilot-reading
    // surfaces above.
    expect(
      deriveManagerOperatingCommandCenterModel().domains.find((d) => d.id === 'new-deal-intake')?.state,
    ).toBe('operational');
    // Factory Arc Phase 14 — same fix applied to the Executive Restart
    // Readiness model, which had the identical dead-constant bug.
    expect(deriveExecutiveRestartReadinessModel().gatedActivationCategories).not.toContain('New Deal create');
  });
});
