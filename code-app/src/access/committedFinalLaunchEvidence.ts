import crmLivePersistence from '../../docs/operator-evidence/final-launch/crmLivePersistence.json';
import portfolioBoarding from '../../docs/operator-evidence/final-launch/portfolioBoarding.json';
import documentChecklist from '../../docs/operator-evidence/final-launch/documentChecklist.json';
import borrowerSend from '../../docs/operator-evidence/final-launch/borrowerSend.json';
import stageAdvancement from '../../docs/operator-evidence/final-launch/stageAdvancement.json';
import {
  parseFinalLaunchSmokeEvidence,
  deriveEvidenceIntegrity,
  FINAL_LAUNCH_CAPABILITIES,
  type FinalLaunchCapability,
  type EvidenceIntegrityReport,
} from './finalLaunchSmokeEvidence';

/**
 * Launch Phase 5 — the committed final-launch evidence as a build-time import.
 *
 * This is the SINGLE SOURCE of launch truth for browser-side projections (which cannot
 * fs-read docs/). The actual `docs/operator-evidence/final-launch/*.json` artifacts are
 * imported at build time and run through the SAME Phase-1 integrity authority
 * (`deriveEvidenceIntegrity`) the node loader + verifier use. When the operator re-captures
 * authentic evidence (Phase 7) and rebuilds for `pac code push`, every projection that reads
 * this module flips together — no second copy to keep in sync, no flag that can assert launch.
 */

const RAW_BY_CAPABILITY: Record<FinalLaunchCapability, unknown> = {
  crmLivePersistence,
  portfolioBoarding,
  documentChecklist,
  borrowerSend,
  stageAdvancement,
};

/** Integrity verdict per launch capability, derived from the committed artifacts. */
export function committedFinalLaunchEvidenceIntegrity(): Record<FinalLaunchCapability, EvidenceIntegrityReport | null> {
  const out = {} as Record<FinalLaunchCapability, EvidenceIntegrityReport | null>;
  for (const cap of FINAL_LAUNCH_CAPABILITIES) {
    const parsed = parseFinalLaunchSmokeEvidence(RAW_BY_CAPABILITY[cap]);
    out[cap] = parsed.ok ? deriveEvidenceIntegrity(parsed.evidence) : null;
  }
  return out;
}

/** True only when the capability has an artifact accepted at HIGH confidence. */
export function isCommittedEvidenceHigh(cap: FinalLaunchCapability): boolean {
  const integ = committedFinalLaunchEvidenceIntegrity()[cap];
  return integ !== null && integ.accepted && integ.confidence === 'HIGH';
}
