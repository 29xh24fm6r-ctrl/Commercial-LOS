import {
  parseFinalLaunchSmokeEvidence,
  deriveEvidenceIntegrity,
  isAttributableOperatorUpn,
  type EvidenceConfidence,
} from './finalLaunchSmokeEvidence';
import { committedFinalLaunchEvidenceIntegrity } from './committedFinalLaunchEvidence';

/**
 * CRM-H — CRM live-persistence certification attribution guard.
 *
 * The committed final-launch smoke (docs/operator-evidence/final-launch/crmLivePersistence.json)
 * records a real live create/readback/update/rollback and is now attributed to a real operator
 * UPN, so it is accepted at HIGH confidence. This module is the single, fail-closed authority
 * that says: a live-persistence smoke may CERTIFY CRM team readiness ONLY when it is accepted at
 * HIGH confidence with an ATTRIBUTABLE operator UPN — an unknown/sentinel operator can NEVER
 * certify, so any future placeholder/sentinel artifact stays blocking until a real attributed
 * smoke replaces it.
 *
 * PURE: reads the committed evidence integrity; flips nothing; fabricates no identity.
 *
 * Factory Arc Phase 12: moved from src/crm/certification/ to src/access/ — this is
 * release/launch-evidence attribution content (the same family as
 * finalLaunchSmokeEvidence.ts / operatorSmokeEvidenceRegistry.ts, both already here),
 * not CRM business logic. Banker/team/manager-facing directories must never directly
 * import launch-evidence internals; see unifiedCrmReadiness.ts for how the banker-safe
 * CRM readiness surface consumes this data at arm's length instead.
 */

/** Where an operator drops the corrected, attributed live smoke (replacing the sentinel one). */
export const CRM_LIVE_PERSISTENCE_EVIDENCE_SLOT = Object.freeze({
  capability: 'crmLivePersistence' as const,
  path: 'docs/operator-evidence/final-launch/crmLivePersistence.json',
  producedBy: 'scripts/dataverse/run-final-launch-smokes.ps1',
  requirement:
    'operatorUpn must be a real, attributable UPN (local@domain.tld) — never a sentinel like "unknown-operator" — with a real machine clock and affectedRecordIds. Re-run the smoke under a signed-in operator and commit the artifact.',
});

export interface CrmCertificationAttribution {
  /** The operator UPN on the committed smoke. */
  readonly operatorUpn: string;
  /** True only for a syntactically valid, non-sentinel operator UPN. */
  readonly attributable: boolean;
  /** The Phase-1 integrity confidence of the committed smoke. */
  readonly confidence: EvidenceConfidence;
  /** Structural GO + attributable identity + machine proof. */
  readonly accepted: boolean;
  /** Ready to certify = accepted AND HIGH confidence. */
  readonly ready: boolean;
  /** While not ready, attribution BLOCKS CRM team readiness. */
  readonly blocking: boolean;
  readonly issues: readonly string[];
  /** The operator evidence slot to correct. */
  readonly evidenceSlot: typeof CRM_LIVE_PERSISTENCE_EVIDENCE_SLOT;
}

/** Derive the CRM live-persistence attribution verdict from the committed evidence. */
export function deriveCrmCertificationAttribution(): CrmCertificationAttribution {
  const integ = committedFinalLaunchEvidenceIntegrity().crmLivePersistence;
  const operatorUpn = integ?.operatorUpn ?? '(no committed smoke)';
  const attributable = integ?.identityValid === true;
  const confidence: EvidenceConfidence = integ?.confidence ?? 'NONE';
  const accepted = integ?.accepted === true;
  const ready = accepted && confidence === 'HIGH';
  const issues = integ?.issues ?? ['No committed CRM live-persistence smoke artifact.'];
  return {
    operatorUpn,
    attributable,
    confidence,
    accepted,
    ready,
    blocking: !ready,
    issues,
    evidenceSlot: CRM_LIVE_PERSISTENCE_EVIDENCE_SLOT,
  };
}

/** True only when the committed CRM smoke is accepted at HIGH confidence with an attributable operator. */
export function isCrmCertificationAttributed(): boolean {
  return deriveCrmCertificationAttribution().ready;
}

/**
 * Validate a CANDIDATE corrected smoke (e.g. before an operator commits it): it must parse,
 * be accepted at HIGH confidence, and carry an attributable operator. Never accepts a sentinel.
 */
export function validateCandidateCrmSmoke(raw: unknown): {
  readonly ok: boolean;
  readonly operatorUpn: string | null;
  readonly attributable: boolean;
  readonly confidence: EvidenceConfidence;
  readonly issues: readonly string[];
} {
  const parsed = parseFinalLaunchSmokeEvidence(raw);
  if (!parsed.ok) {
    return { ok: false, operatorUpn: null, attributable: false, confidence: 'NONE', issues: parsed.errors };
  }
  const integrity = deriveEvidenceIntegrity(parsed.evidence);
  const attributable = isAttributableOperatorUpn(parsed.evidence.operatorUpn);
  const ok = integrity.accepted && integrity.confidence === 'HIGH';
  return {
    ok,
    operatorUpn: parsed.evidence.operatorUpn,
    attributable,
    confidence: integrity.confidence,
    issues: integrity.issues,
  };
}
