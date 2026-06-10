/**
 * Phase 142L — Admin configuration integration transport (FAKE / OFFLINE ONLY).
 *
 * A proof-of-concept transport boundary for the Phase 142K controlled apply
 * workflow. It proves that a validated, non-executable apply plan can be handed
 * to a transport boundary and audited WITHOUT any live effect. It is FAKE / DRY-RUN
 * / PROOF-ONLY: NO fetch, NO XMLHttpRequest, NO axios, NO network client, NO
 * Dataverse write, NO CRM write, NO POST/PATCH/PUT/DELETE, NO schema mutation, NO
 * eval/Function, NO executable payload path. Every outcome keeps
 * `liveWritePerformed: false`; nothing is ever applied to a live system.
 */

import type { AdminConfigurationApplyPlan } from './adminConfigurationApplyTypes';
import { scanUnsafeContent } from './adminConfigurationContentSafety';

export const ADMIN_CONFIG_TRANSPORT_SOURCE = 'admin_configuration_apply_workflow' as const;
export const ADMIN_CONFIG_TRANSPORT_MODE = 'fake_transport_only' as const;

export interface AdminConfigurationApplyProofChange {
  stepType: string;
  field: string;
  beforeSummary?: string;
  afterSummary?: string;
}

export interface AdminConfigurationApplyProofRequest {
  planId: string;
  requestedAt: string;
  actor: string;
  changes: readonly AdminConfigurationApplyProofChange[];
  /** Fixed true — a non-true value is rejected. */
  proofOnly: true;
  source: typeof ADMIN_CONFIG_TRANSPORT_SOURCE;
  mode: typeof ADMIN_CONFIG_TRANSPORT_MODE;
}

export type AdminConfigurationApplyProofRejectedReason =
  | 'empty_plan'
  | 'not_proof_only'
  | 'not_fake_transport'
  | 'unsafe_payload';

export interface AdminConfigurationApplyProofAuditSummary {
  planId: string;
  changeCount: number;
  proofOnly: true;
  liveWritePerformed: false;
  containsExecutable: false;
  readOnly: true;
}

export interface AdminConfigurationApplyProofResult {
  status: 'proof_recorded' | 'rejected';
  mode: typeof ADMIN_CONFIG_TRANSPORT_MODE;
  proofOnly: true;
  /** Pinned false — no live system is ever changed by this transport. */
  liveWritePerformed: false;
  transportProofId?: string;
  message: string;
  rejectedReason?: AdminConfigurationApplyProofRejectedReason;
  auditSummary: AdminConfigurationApplyProofAuditSummary;
}

const NO_LIVE_MESSAGE = 'Proof-only fake transport — no live system was changed and no data was written.';

/** Deterministic, non-random id derived from stable local inputs (FNV-1a, hex). */
function deterministicProofId(planId: string, requestedAt: string, changeCount: number): string {
  const seed = `${planId}|${requestedAt}|${changeCount}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    // FNV prime multiply, kept in 32-bit unsigned range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `proof_${hash.toString(16).padStart(8, '0')}`;
}

function rejected(
  planId: string,
  changeCount: number,
  reason: AdminConfigurationApplyProofRejectedReason,
  message: string,
): AdminConfigurationApplyProofResult {
  return {
    status: 'rejected',
    mode: ADMIN_CONFIG_TRANSPORT_MODE,
    proofOnly: true,
    liveWritePerformed: false,
    message: `${message} ${NO_LIVE_MESSAGE}`,
    rejectedReason: reason,
    auditSummary: { planId, changeCount, proofOnly: true, liveWritePerformed: false, containsExecutable: false, readOnly: true },
  };
}

/**
 * Submit an apply-plan proof to the FAKE transport. Synchronous, pure, and
 * offline. Returns `proof_recorded` only for a validated proof-only request;
 * rejects missing/empty plans, non-proof-only requests, the wrong mode, and any
 * suspicious executable / unsafe payload. Never performs a live write.
 */
export function submitAdminConfigurationApplyProof(
  request: AdminConfigurationApplyProofRequest | null | undefined,
): AdminConfigurationApplyProofResult {
  const planId = request?.planId ?? '';
  const changes = request?.changes ?? [];
  const changeCount = changes.length;

  if (!request || planId.trim().length === 0 || changeCount === 0) {
    return rejected(planId, changeCount, 'empty_plan', 'Rejected: a non-empty apply plan is required.');
  }
  if (request.proofOnly !== true) {
    return rejected(planId, changeCount, 'not_proof_only', 'Rejected: only proof-only requests are accepted.');
  }
  if (request.mode !== ADMIN_CONFIG_TRANSPORT_MODE || request.source !== ADMIN_CONFIG_TRANSPORT_SOURCE) {
    return rejected(planId, changeCount, 'not_fake_transport', 'Rejected: only the fake transport source/mode is accepted.');
  }

  // Reject any suspicious executable / SQL / secret / PII payload in keys or values.
  const payloadText = changes
    .map((c) => `${c.stepType}\n${c.field}\n${c.beforeSummary ?? ''}\n${c.afterSummary ?? ''}`)
    .join('\n');
  const scan = scanUnsafeContent(payloadText);
  if (scan.unsafe) {
    return rejected(planId, changeCount, 'unsafe_payload', `Rejected: payload contains unsafe content (${scan.reasons.join(', ')}).`);
  }

  return {
    status: 'proof_recorded',
    mode: ADMIN_CONFIG_TRANSPORT_MODE,
    proofOnly: true,
    liveWritePerformed: false,
    transportProofId: deterministicProofId(planId, request.requestedAt, changeCount),
    message: `Transport boundary proof recorded (fake / offline). ${NO_LIVE_MESSAGE}`,
    auditSummary: { planId, changeCount, proofOnly: true, liveWritePerformed: false, containsExecutable: false, readOnly: true },
  };
}

export interface BuildAdminConfigurationApplyProofRequestOptions {
  requestedAt: string;
  actor?: string;
}

/** Normalize a validated apply plan into a proof-only fake-transport request. */
export function buildAdminConfigurationApplyProofRequest(
  plan: AdminConfigurationApplyPlan,
  opts: BuildAdminConfigurationApplyProofRequestOptions,
): AdminConfigurationApplyProofRequest {
  return {
    planId: plan.proposalId,
    requestedAt: opts.requestedAt,
    actor: opts.actor ?? 'unknown',
    changes: plan.steps.map((s) => ({
      stepType: s.stepType,
      field: s.label,
      beforeSummary: s.beforeSummary,
      afterSummary: s.afterSummary,
    })),
    proofOnly: true,
    source: ADMIN_CONFIG_TRANSPORT_SOURCE,
    mode: ADMIN_CONFIG_TRANSPORT_MODE,
  };
}
