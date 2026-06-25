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

  if (r.affectedRecordIds !== undefined && !isStringArray(r.affectedRecordIds)) errors.push('affectedRecordIds, when present, must be a string array');
  if (r.cleanupRecordIds !== undefined && !isStringArray(r.cleanupRecordIds)) errors.push('cleanupRecordIds, when present, must be a string array');

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
    ...(isStringArray(r.affectedRecordIds) ? { affectedRecordIds: r.affectedRecordIds } : {}),
    ...(isStringArray(r.cleanupRecordIds) ? { cleanupRecordIds: r.cleanupRecordIds } : {}),
  };
  return { ok: true, evidence };
}

/**
 * A capability is GO only when its live smoke passed, was a real live operation, was read
 * back, AND its closure is verified: borrowerSend requires delivery/audit verification;
 * every other capability requires a verified rollback/cleanup.
 */
export function isFinalLaunchSmokeGo(e: FinalLaunchSmokeEvidence): boolean {
  if (e.outcome !== 'passed') return false;
  if (!e.liveOperationPerformed) return false;
  if (!e.readbackVerified) return false;
  if (e.capability === BORROWER_SEND_CAPABILITY) {
    return e.deliveryVerified === true || e.auditVerified === true;
  }
  return e.rollbackVerified === true;
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
