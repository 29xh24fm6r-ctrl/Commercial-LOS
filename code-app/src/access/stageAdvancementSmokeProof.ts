/**
 * WFLOW-I — machine-proven stage-transition smoke proof.
 *
 * The final-launch evidence schema (finalLaunchSmokeEvidence.ts) is the launch GATE; this
 * is the richer, stage-specific PROOF an operator records after actually running a governed
 * stage transition against the live org. It captures the full provenance the audit demanded
 * and NEVER lets prose stand in for proof:
 *
 *   operatorUpn + systemUserId (who), environmentUrl + environmentId (where),
 *   dealId + fromStage → toStage (what moved), affectedRecordIds (the deal + evidence rows
 *   actually written), auditRecordId + timelineRecordId (the governed evidence created),
 *   readbackVerified + readbackProof (the re-read that CONFIRMED persistence),
 *   correlationId + completedAtIso (traceability), note (the rollback/readback narrative).
 *
 * `machineProven` is true ONLY when every field is present, attributable, and internally
 * consistent. The signature failure this guards against: a record that CLAIMS
 * `readbackVerified: true` while carrying no `readbackProof` and no `affectedRecordIds` —
 * prose overclaiming a readback that never produced machine artifacts. That is flagged as
 * fabrication and is NOT machine-proven.
 */

import { isAttributableOperatorUpn, isSyntheticTimestamp } from './finalLaunchSmokeEvidence';
import { recognizeCanonicalStage } from '../workflow/stageOrderingContract';

export interface StageAdvancementSmokeProof {
  readonly operatorUpn: string;
  /** The operator's Dataverse systemuserid (a real GUID — the actor behind the write). */
  readonly systemUserId: string;
  readonly environmentUrl: string;
  readonly environmentId: string;
  readonly dealId: string;
  readonly fromStage: string;
  readonly toStage: string;
  readonly correlationId: string;
  readonly completedAtIso: string;
  /** The record ids actually written (the deal + any evidence rows) — the machine proof. */
  readonly affectedRecordIds: readonly string[];
  /** The created governed cr664_AuditEvent id. */
  readonly auditRecordId: string;
  /** The created cr664_dealtimelineevent id. */
  readonly timelineRecordId: string;
  /** True ONLY when the deal stage was re-read and confirmed (must be backed by readbackProof). */
  readonly readbackVerified: boolean;
  /** The concrete readback artifact, e.g. "cr664_StageReference=<id>; cr664_stageentrydate=<iso>". */
  readonly readbackProof?: string;
  /** The rollback / readback narrative note. */
  readonly note: string;
}

export interface StageSmokeProofResult {
  /** True only when every field is present, attributable, and internally consistent. */
  readonly machineProven: boolean;
  readonly confidence: 'HIGH' | 'LOW' | 'NONE';
  /** Structural / attribution problems. */
  readonly issues: readonly string[];
  /** Specific overclaim/fabrication signals (e.g. readback claimed without proof). */
  readonly fabricationFlags: readonly string[];
}

const GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';

function isRealGuid(v: string | undefined): boolean {
  const s = (v ?? '').trim();
  return GUID_PATTERN.test(s) && s.toLowerCase() !== ZERO_GUID;
}

function nonEmpty(v: string | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function hasNonEmptyIds(ids: readonly string[] | undefined): boolean {
  return Array.isArray(ids) && ids.some((x) => typeof x === 'string' && x.trim().length > 0);
}

/**
 * Derive the machine-proof verdict. Pure and fail-closed — it never infers a pass and it
 * treats an unbacked readback claim as fabrication, not proof.
 */
export function deriveStageAdvancementSmokeProof(p: StageAdvancementSmokeProof): StageSmokeProofResult {
  const issues: string[] = [];
  const fabricationFlags: string[] = [];

  if (!isAttributableOperatorUpn(p.operatorUpn)) issues.push(`operatorUpn "${p.operatorUpn}" is not an attributable UPN.`);
  if (!isRealGuid(p.systemUserId)) issues.push('systemUserId is not a real (non-zero) GUID.');
  if (!nonEmpty(p.environmentUrl)) issues.push('environmentUrl is missing.');
  if (!nonEmpty(p.environmentId)) issues.push('environmentId is missing.');
  if (!nonEmpty(p.dealId)) issues.push('dealId is missing.');
  if (!nonEmpty(p.correlationId)) issues.push('correlationId is missing.');
  if (!nonEmpty(p.note)) issues.push('rollback/readback note is missing.');

  const fromOk = recognizeCanonicalStage(p.fromStage) !== undefined;
  const toOk = recognizeCanonicalStage(p.toStage) !== undefined;
  if (!fromOk) issues.push(`fromStage "${p.fromStage}" is not a canonical stage.`);
  if (!toOk) issues.push(`toStage "${p.toStage}" is not a canonical stage.`);
  if (fromOk && toOk && p.fromStage.trim().toUpperCase() === p.toStage.trim().toUpperCase()) {
    issues.push('fromStage and toStage are identical — no move occurred.');
  }

  const timeParseable = nonEmpty(p.completedAtIso) && !Number.isNaN(Date.parse(p.completedAtIso));
  if (!timeParseable) issues.push('completedAtIso is not a parseable timestamp.');

  // Machine proof: the write actually produced records + governed evidence rows.
  if (!hasNonEmptyIds(p.affectedRecordIds)) {
    issues.push('affectedRecordIds is empty — no machine proof of a real write.');
    fabricationFlags.push('no-affected-record-ids');
  }
  if (!nonEmpty(p.auditRecordId)) issues.push('auditRecordId is missing (no governed audit row).');
  if (!nonEmpty(p.timelineRecordId)) issues.push('timelineRecordId is missing (no timeline row).');

  // The overclaim guard: a readback claim MUST be backed by a concrete readback artifact.
  if (p.readbackVerified && !nonEmpty(p.readbackProof)) {
    fabricationFlags.push('readback-claimed-without-proof');
    issues.push('readbackVerified is true but no readbackProof is recorded — an unbacked readback claim.');
  }
  if (!p.readbackVerified) {
    issues.push('readbackVerified is false — persistence was not proven by a readback.');
  }

  const machineProven = issues.length === 0 && fabricationFlags.length === 0;

  let confidence: StageSmokeProofResult['confidence'];
  if (!machineProven) {
    confidence = 'NONE';
  } else if (isSyntheticTimestamp(p.completedAtIso)) {
    confidence = 'LOW';
  } else {
    confidence = 'HIGH';
  }

  return { machineProven, confidence, issues, fabricationFlags };
}
