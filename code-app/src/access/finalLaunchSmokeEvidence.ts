import type { OperatorSmokeEvidence, SmokeCapability } from './operatorSmokeEvidenceRegistry';

/**
 * Phase 256A — Final-launch operator smoke evidence schema + parser (PURE, fail-closed).
 *
 * One record per remaining live-write capability, produced by the OPERATOR-RUN harness
 * scripts/dataverse/run-final-launch-smokes.ps1 (or by -RecordManualEvidence). The agent
 * never fabricates these: a gate may be flipped ONLY when a real artifact for its
 * capability validates here AND its outcome is "passed" with the required verifications.
 *
 * This module performs NO IO (no fs, no network) so it is safe to import anywhere. The
 * fs loader that reads docs/operator-evidence/final-launch/*.json lives in the node-only
 * finalLaunchSmokeEvidenceLoader.ts.
 */

export const FINAL_LAUNCH_CAPABILITIES = [
  'crmLivePersistence',
  'portfolioBoarding',
  'documentChecklist',
  'borrowerSend',
  'stageAdvancement',
] as const;
export type FinalLaunchCapability = (typeof FINAL_LAUNCH_CAPABILITIES)[number];

export const FINAL_LAUNCH_OUTCOMES = ['passed', 'failed'] as const;
export type FinalLaunchOutcome = (typeof FINAL_LAUNCH_OUTCOMES)[number];

/**
 * borrowerSend verifies live delivery/audit instead of a rollback (an email cannot be
 * "rolled back"); every other capability requires a verified rollback/cleanup.
 */
export const BORROWER_SEND_CAPABILITY: FinalLaunchCapability = 'borrowerSend';

export interface FinalLaunchSmokeEvidence {
  readonly capability: FinalLaunchCapability;
  readonly outcome: FinalLaunchOutcome;
  readonly operatorUpn: string;
  readonly environmentUrl: string;
  readonly environmentId: string;
  readonly correlationId: string;
  readonly startedAtIso: string;
  readonly completedAtIso: string;
  /** The smoke performed a real live operation (never a dry-run/mock). Must be true to pass. */
  readonly liveOperationPerformed: boolean;
  /** The created/updated record(s) were read back and matched. Must be true to pass. */
  readonly readbackVerified: boolean;
  /** Created records were rolled back / cleaned up. Required true EXCEPT borrowerSend. */
  readonly rollbackVerified: boolean;
  /** borrowerSend: the audited live send was delivery/audit-verified. */
  readonly deliveryVerified?: boolean;
  /** Optional explicit audit-sink confirmation (stage advancement / borrower send). */
  readonly auditVerified?: boolean;
  readonly evidenceNote: string;
  readonly affectedRecordIds?: readonly string[];
  readonly cleanupRecordIds?: readonly string[];
  // --- Phase 1 (launch readiness) — EXTERNAL_SEND machine proof ---
  /** borrowerSend: the transport-issued delivery receipt / message id. */
  readonly deliveryReceiptId?: string;
  /** borrowerSend: the approved test recipient the live send went to. */
  readonly approvedRecipient?: string;
  /** borrowerSend: the named approver who authorized the live send (a valid UPN). */
  readonly approverUpn?: string;
}

/**
 * Phase 1 (launch readiness) — evidence classes. AUTOMATED_CRUD smokes must carry
 * machine proof (record ids of what they created/cleaned). EXTERNAL_SEND (borrower email)
 * must carry a transport receipt + approved recipient + named approver — an email cannot
 * be "rolled back," so its proof is a delivery receipt, not a cleanup id.
 */
export type EvidenceClass = 'AUTOMATED_CRUD' | 'EXTERNAL_SEND';

export const EVIDENCE_CLASS_BY_CAPABILITY: Record<FinalLaunchCapability, EvidenceClass> = {
  crmLivePersistence: 'AUTOMATED_CRUD',
  portfolioBoarding: 'AUTOMATED_CRUD',
  documentChecklist: 'AUTOMATED_CRUD',
  stageAdvancement: 'AUTOMATED_CRUD',
  borrowerSend: 'EXTERNAL_SEND',
};

/**
 * Sentinel / non-attributable operator values. A launch gate may NEVER certify a domain
 * to one of these — they name no real actor. `unknown-operator` is the harness's failure
 * sentinel; the all-zero GUID and generic role words are likewise rejected.
 */
export const SENTINEL_OPERATOR_UPNS: ReadonlySet<string> = new Set([
  'unknown-operator',
  'unknown',
  '',
  'system',
  'service-account',
  'serviceaccount',
  'n/a',
  'na',
  'none',
  '00000000-0000-0000-0000-000000000000',
]);

const UPN_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True only for a syntactically valid, non-sentinel operator UPN (local@domain.tld). */
export function isAttributableOperatorUpn(upn: string | undefined): boolean {
  const v = (upn ?? '').trim();
  if (SENTINEL_OPERATOR_UPNS.has(v.toLowerCase())) return false;
  return UPN_PATTERN.test(v);
}

/**
 * Heuristic: a round, second-aligned timestamp with no sub-second precision
 * (…:SS=00.000) — the signature of a hand-recorded `-RecordManualEvidence` time rather
 * than a machine clock. Loadable, but downgrades AUTOMATED_CRUD confidence to LOW.
 */
export function isSyntheticTimestamp(iso: string | undefined): boolean {
  if (typeof iso !== 'string') return false;
  return /T\d{2}:\d{2}:00\.000Z?$/.test(iso.trim());
}

function hasNonEmptyIds(ids: readonly string[] | undefined): boolean {
  return Array.isArray(ids) && ids.some((x) => typeof x === 'string' && x.trim().length > 0);
}

export type EvidenceConfidence = 'HIGH' | 'LOW' | 'NONE';

export interface EvidenceIntegrityReport {
  readonly capability: FinalLaunchCapability;
  readonly evidenceClass: EvidenceClass;
  /** GO-eligible: shape GO AND attributable identity AND machine proof present. */
  readonly accepted: boolean;
  readonly operatorUpn: string;
  readonly identityValid: boolean;
  readonly machineProofPresent: boolean;
  readonly confidence: EvidenceConfidence;
  readonly issues: readonly string[];
}

/**
 * Phase 1 — integrity assessment. Combines the structural GO predicate with attributable
 * identity and per-class machine proof, and grades confidence. NEVER infers a pass: a domain
 * is `accepted` only with shape GO + a valid operator UPN + machine proof, and only `HIGH`
 * confidence when its machine clock looks real. Fail-closed by construction.
 */
export function deriveEvidenceIntegrity(e: FinalLaunchSmokeEvidence): EvidenceIntegrityReport {
  const evidenceClass = EVIDENCE_CLASS_BY_CAPABILITY[e.capability];
  const issues: string[] = [];

  const shapeGo = isFinalLaunchSmokeShapeGo(e);
  if (!shapeGo) issues.push('Smoke outcome/live/readback/closure not fully verified.');

  const identityValid = isAttributableOperatorUpn(e.operatorUpn);
  if (!identityValid) issues.push(`operatorUpn "${e.operatorUpn}" is not an attributable UPN (sentinel or malformed).`);

  let machineProofPresent: boolean;
  if (evidenceClass === 'EXTERNAL_SEND') {
    const hasReceipt = (e.deliveryReceiptId ?? '').trim().length > 0;
    const hasRecipient = (e.approvedRecipient ?? '').trim().length > 0;
    const hasApprover = isAttributableOperatorUpn(e.approverUpn);
    machineProofPresent = hasReceipt && hasRecipient && hasApprover;
    if (!hasReceipt) issues.push('External send is missing a transport deliveryReceiptId.');
    if (!hasRecipient) issues.push('External send is missing an approvedRecipient.');
    if (!hasApprover) issues.push('External send is missing a valid approverUpn.');
  } else {
    machineProofPresent = hasNonEmptyIds(e.affectedRecordIds);
    if (!machineProofPresent) issues.push('Automated CRUD evidence carries no affectedRecordIds (no machine proof).');
  }

  const accepted = shapeGo && identityValid && machineProofPresent;

  let confidence: EvidenceConfidence;
  if (!accepted) {
    confidence = 'NONE';
  } else if (evidenceClass === 'AUTOMATED_CRUD' && isSyntheticTimestamp(e.completedAtIso)) {
    confidence = 'LOW';
    issues.push('Round, second-aligned completedAtIso — low-confidence (hand-recorded) machine clock.');
  } else {
    confidence = 'HIGH';
  }

  return { capability: e.capability, evidenceClass, accepted, operatorUpn: e.operatorUpn, identityValid, machineProofPresent, confidence, issues };
}

export type FinalLaunchParseResult =
  | { readonly ok: true; readonly evidence: FinalLaunchSmokeEvidence }
  | { readonly ok: false; readonly errors: readonly string[] };

const REQUIRED_STRINGS: ReadonlyArray<keyof FinalLaunchSmokeEvidence> = [
  'operatorUpn',
  'environmentUrl',
  'environmentId',
  'correlationId',
  'startedAtIso',
  'completedAtIso',
  'evidenceNote',
];

function isCapability(v: unknown): v is FinalLaunchCapability {
  return typeof v === 'string' && (FINAL_LAUNCH_CAPABILITIES as readonly string[]).includes(v);
}
function isOutcome(v: unknown): v is FinalLaunchOutcome {
  return typeof v === 'string' && (FINAL_LAUNCH_OUTCOMES as readonly string[]).includes(v);
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Optional id-list fields (affectedRecordIds / cleanupRecordIds) are provenance only and do
 * NOT affect GO. Accept a string array OR a bare string (the PowerShell harness unwraps a
 * single-element array to a scalar when serializing one id) and normalize to a string array.
 * Anything else (e.g. numbers) is rejected, so the parser stays fail-closed.
 */
function normalizeIdList(v: unknown): { readonly ok: true; readonly value?: readonly string[] } | { readonly ok: false } {
  if (v === undefined) return { ok: true };
  if (typeof v === 'string') return { ok: true, value: [v] };
  if (isStringArray(v)) return { ok: true, value: [...v] };
  return { ok: false };
}

/**
 * Parse + validate a single record. Fail-closed: any missing/invalid required field
 * yields { ok:false, errors }. It NEVER coerces a malformed record into a pass and it
 * NEVER infers verification booleans that are absent.
 */
export function parseFinalLaunchSmokeEvidence(raw: unknown): FinalLaunchParseResult {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['evidence must be a JSON object'] };
  }
  const r = raw as Record<string, unknown>;

  if (!isCapability(r.capability)) errors.push(`capability must be one of ${FINAL_LAUNCH_CAPABILITIES.join(', ')}`);
  if (!isOutcome(r.outcome)) errors.push(`outcome must be one of ${FINAL_LAUNCH_OUTCOMES.join(', ')}`);

  for (const key of REQUIRED_STRINGS) {
    const v = r[key];
    if (typeof v !== 'string' || v.trim().length === 0) errors.push(`missing ${String(key)}`);
  }
  for (const key of ['startedAtIso', 'completedAtIso'] as const) {
    const v = r[key];
    if (typeof v === 'string' && v.trim().length > 0 && Number.isNaN(Date.parse(v))) {
      errors.push(`${key} is not a parseable ISO timestamp`);
    }
  }

  if (typeof r.liveOperationPerformed !== 'boolean') errors.push('liveOperationPerformed must be a boolean');
  if (typeof r.readbackVerified !== 'boolean') errors.push('readbackVerified must be a boolean');
  if (typeof r.rollbackVerified !== 'boolean') errors.push('rollbackVerified must be a boolean');

  // borrowerSend MUST carry a delivery/audit verification boolean (rollback does not apply).
  if (r.capability === BORROWER_SEND_CAPABILITY) {
    const hasDelivery = typeof r.deliveryVerified === 'boolean';
    const hasAudit = typeof r.auditVerified === 'boolean';
    if (!hasDelivery && !hasAudit) errors.push('borrowerSend requires a deliveryVerified or auditVerified boolean');
  } else if (r.deliveryVerified !== undefined && typeof r.deliveryVerified !== 'boolean') {
    errors.push('deliveryVerified, when present, must be a boolean');
  }
  if (r.auditVerified !== undefined && typeof r.auditVerified !== 'boolean') errors.push('auditVerified, when present, must be a boolean');

  // Phase 1 — optional EXTERNAL_SEND proof fields, when present, must be strings.
  for (const key of ['deliveryReceiptId', 'approvedRecipient', 'approverUpn'] as const) {
    if (r[key] !== undefined && typeof r[key] !== 'string') errors.push(`${key}, when present, must be a string`);
  }

  const affected = normalizeIdList(r.affectedRecordIds);
  if (!affected.ok) errors.push('affectedRecordIds, when present, must be a string or string array');
  const cleanup = normalizeIdList(r.cleanupRecordIds);
  if (!cleanup.ok) errors.push('cleanupRecordIds, when present, must be a string or string array');

  if (errors.length > 0) return { ok: false, errors };

  const evidence: FinalLaunchSmokeEvidence = {
    capability: r.capability as FinalLaunchCapability,
    outcome: r.outcome as FinalLaunchOutcome,
    operatorUpn: String(r.operatorUpn),
    environmentUrl: String(r.environmentUrl),
    environmentId: String(r.environmentId),
    correlationId: String(r.correlationId),
    startedAtIso: String(r.startedAtIso),
    completedAtIso: String(r.completedAtIso),
    liveOperationPerformed: r.liveOperationPerformed as boolean,
    readbackVerified: r.readbackVerified as boolean,
    rollbackVerified: r.rollbackVerified as boolean,
    ...(typeof r.deliveryVerified === 'boolean' ? { deliveryVerified: r.deliveryVerified } : {}),
    ...(typeof r.auditVerified === 'boolean' ? { auditVerified: r.auditVerified } : {}),
    evidenceNote: String(r.evidenceNote),
    ...(affected.ok && affected.value !== undefined ? { affectedRecordIds: affected.value } : {}),
    ...(cleanup.ok && cleanup.value !== undefined ? { cleanupRecordIds: cleanup.value } : {}),
    ...(typeof r.deliveryReceiptId === 'string' ? { deliveryReceiptId: r.deliveryReceiptId } : {}),
    ...(typeof r.approvedRecipient === 'string' ? { approvedRecipient: r.approvedRecipient } : {}),
    ...(typeof r.approverUpn === 'string' ? { approverUpn: r.approverUpn } : {}),
  };
  return { ok: true, evidence };
}

/**
 * STRUCTURAL GO: the smoke passed, was a real live operation, was read back, AND its closure
 * is verified (borrowerSend = delivery/audit; others = rollback/cleanup). This checks shape
 * only — NOT identity or machine proof. Use `isFinalLaunchSmokeGo` for the certification gate.
 */
export function isFinalLaunchSmokeShapeGo(e: FinalLaunchSmokeEvidence): boolean {
  if (e.outcome !== 'passed') return false;
  if (!e.liveOperationPerformed) return false;
  if (!e.readbackVerified) return false;
  if (e.capability === BORROWER_SEND_CAPABILITY) {
    return e.deliveryVerified === true || e.auditVerified === true;
  }
  return e.rollbackVerified === true;
}

/**
 * CERTIFICATION GO (Phase 1, hardened): a capability is GO only when its evidence is
 * `accepted` by the integrity report — structural GO AND an attributable operator UPN
 * (no sentinels) AND class-appropriate machine proof (AUTOMATED_CRUD record ids;
 * EXTERNAL_SEND delivery receipt + approved recipient + named approver). This is the single
 * predicate every gate consumes; it can only be made stricter, never looser.
 */
export function isFinalLaunchSmokeGo(e: FinalLaunchSmokeEvidence): boolean {
  return deriveEvidenceIntegrity(e).accepted;
}

/** Map a final-launch capability to the operatorSmokeEvidenceRegistry capability id. */
export const FINAL_LAUNCH_TO_REGISTRY_CAPABILITY: Record<FinalLaunchCapability, SmokeCapability> = {
  crmLivePersistence: 'crm-writeback',
  portfolioBoarding: 'portfolio-boarding',
  documentChecklist: 'checklist-generation',
  borrowerSend: 'borrower-communication',
  stageAdvancement: 'stage-progression',
};

/**
 * Adapt a final-launch record into the registry's OperatorSmokeEvidence. The registry's
 * GO requires rollbackVerified, so borrowerSend's delivery/audit verification is mapped
 * onto that field (an email's "closure" is verified delivery, not a rollback). The mapped
 * outcome stays "passed" ONLY when the strict final-launch GO predicate holds; otherwise
 * it is downgraded to "failed" so the registry blocks it (never an inferred pass).
 */
export function toOperatorSmokeEvidence(e: FinalLaunchSmokeEvidence): OperatorSmokeEvidence {
  const go = isFinalLaunchSmokeGo(e);
  const rollbackForRegistry =
    e.capability === BORROWER_SEND_CAPABILITY ? e.deliveryVerified === true || e.auditVerified === true : e.rollbackVerified === true;
  return {
    capability: FINAL_LAUNCH_TO_REGISTRY_CAPABILITY[e.capability],
    outcome: go ? 'passed' : 'failed',
    actorUpn: e.operatorUpn,
    actorPlatformUserId: e.operatorUpn,
    timestamp: e.completedAtIso,
    correlationId: e.correlationId,
    environmentName: e.environmentUrl,
    evidenceNote: e.evidenceNote,
    rollbackVerified: rollbackForRegistry,
  };
}
