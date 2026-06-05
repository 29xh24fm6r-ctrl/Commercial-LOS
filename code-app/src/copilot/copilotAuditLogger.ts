/**
 * Phase 137K — Copilot audit logger (INERT interface + skeleton).
 *
 * App-side, pure TypeScript realization of how the FUTURE server-side
 * handler will write Copilot audit events to the future Dataverse table
 * `cr664_copilotauditevent` (Phase 137I design / Phase 137J metadata plan).
 *
 * It performs NO IO: no `fetch`, no Dataverse write, no generated service,
 * no network, no secret, no `import.meta.env`, and it imports NO runtime
 * connector transport. The only logger it ships is the DISABLED / no-op
 * logger, which fails closed with `audit_unavailable` and never fabricates
 * an event id. The runtime Copilot connector stays not_configured.
 *
 * Core rule it encodes (Phase 137H/137I): the server handler must write an
 * `audit_start` event BEFORE any Azure OpenAI / model call; if it cannot,
 * the handler fails closed with `audit_unavailable` and makes no model
 * call. This module models that contract without enabling anything.
 */

import type {
  CopilotCustomApiRequest,
  CopilotCustomApiResponse,
  CopilotFailClosedCode,
  CopilotMode,
  CopilotPromptKind,
  CopilotSurface,
  CopilotWorkspace,
} from './copilotCustomApiContract';

/** The future Dataverse audit table (Phase 137I / 137J). Not created here. */
export const COPILOT_AUDIT_TABLE_LOGICAL_NAME = 'cr664_copilotauditevent';

/** Current audit payload schema version. */
export const COPILOT_AUDIT_PAYLOAD_VERSION = '1';

export type CopilotAuditEventType =
  | 'audit_start'
  | 'audit_completion'
  | 'audit_fail_closed'
  | 'proposal_confirmed'
  | 'governed_write_completed';

export const COPILOT_AUDIT_EVENT_TYPES: ReadonlyArray<CopilotAuditEventType> = [
  'audit_start',
  'audit_completion',
  'audit_fail_closed',
  'proposal_confirmed',
  'governed_write_completed',
];

/**
 * Audit event payload (app-side shape). A future server logger maps these
 * onto the `cr664_*` columns. Prompt/context are carried ONLY as redacted
 * summaries / hashes — never raw content.
 */
export interface CopilotAuditEventPayload {
  correlationId: string;
  eventType: CopilotAuditEventType;
  payloadVersion: string;
  eventTimestamp?: string;
  // Caller identity / surface.
  userUpn?: string;
  userProfileId?: string;
  workspaceName?: string;
  workspace?: CopilotWorkspace;
  surface?: CopilotSurface;
  dealId?: string;
  dealName?: string;
  // Prompt / context — SUMMARIES / HASHES ONLY (never raw).
  promptKind?: CopilotPromptKind;
  redactedPromptSummary?: string;
  promptHash?: string;
  contextSummary?: string;
  contextHash?: string;
  // Request / response metadata.
  mode?: CopilotMode;
  policyVersion?: string;
  modelDeployment?: string;
  modelVersion?: string;
  responseMode?: CopilotMode;
  isLive?: boolean;
  failClosedCode?: CopilotFailClosedCode;
  warningsJson?: string;
  proposalsJson?: string;
  proposalCount?: number;
  // Proposal-confirmation / governed-write linkage.
  confirmationStatus?: 'proposed' | 'confirmed' | 'declined';
  confirmedProposalId?: string;
  governedWritePath?: string;
  governedWriteId?: string;
  // Error info (connector_exception).
  errorClass?: string;
  errorSummary?: string;
}

export interface CopilotAuditWriteResult {
  ok: boolean;
  /** Real event id (the Dataverse row id) — set ONLY by a real logger. */
  eventId?: string;
  failClosedCode?: CopilotFailClosedCode;
  reason?: string;
}

/**
 * The audit-write boundary a future server-side logger implements. The
 * only implementation shipped in Phase 137K is the disabled / no-op logger.
 */
export interface CopilotAuditLogger {
  writeEvent(event: CopilotAuditEventPayload): Promise<CopilotAuditWriteResult>;
}

// ---------------------------------------------------------------------------
// Disabled / no-op logger — fails closed, never writes, never fabricates.
// ---------------------------------------------------------------------------

/**
 * The only logger Phase 137K ships. Its `writeEvent` performs NO IO and
 * always returns a fail-closed result with `audit_unavailable`. It never
 * returns `ok: true` and never fabricates an `eventId`.
 */
export function createDisabledCopilotAuditLogger(
  reason: string,
): CopilotAuditLogger {
  return {
    writeEvent(_event: CopilotAuditEventPayload): Promise<CopilotAuditWriteResult> {
      // No write. No event id. Honest fail-closed.
      return Promise.resolve({
        ok: false,
        failClosedCode: 'audit_unavailable',
        reason,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Pure builders (request/response → audit payload). No IO.
// ---------------------------------------------------------------------------

export interface CopilotAuditBuildOptions {
  eventTimestamp?: string;
  payloadVersion?: string;
  /** Redacted prompt summary (caller-computed; never raw text). */
  redactedPromptSummary?: string;
  promptHash?: string;
  /** Redacted context summary (caller-computed; never raw context). */
  contextSummary?: string;
  contextHash?: string;
  policyVersion?: string;
  modelDeployment?: string;
  modelVersion?: string;
}

function baseFromRequest(
  request: CopilotCustomApiRequest,
  eventType: CopilotAuditEventType,
  options: CopilotAuditBuildOptions,
): CopilotAuditEventPayload {
  // NOTE: deliberately maps only structural ids / enums + caller-supplied
  // redacted summaries. It never copies request.prompt.text or the raw
  // request.context (documents/metrics/flags) into the payload.
  return {
    correlationId: request.correlationId,
    eventType,
    payloadVersion: options.payloadVersion ?? COPILOT_AUDIT_PAYLOAD_VERSION,
    eventTimestamp: options.eventTimestamp,
    userUpn: request.user.upn,
    userProfileId: request.user.profileId,
    workspaceName: request.user.workspaceName,
    workspace: request.workspace,
    surface: request.surface,
    dealId: request.context.dealId,
    dealName: request.context.dealName,
    promptKind: request.prompt.kind,
    redactedPromptSummary: options.redactedPromptSummary,
    promptHash: options.promptHash,
    contextSummary: options.contextSummary,
    contextHash: options.contextHash,
    mode: request.mode,
    policyVersion: options.policyVersion,
  };
}

export function buildCopilotAuditStartEvent(
  request: CopilotCustomApiRequest,
  options: CopilotAuditBuildOptions = {},
): CopilotAuditEventPayload {
  return baseFromRequest(request, 'audit_start', options);
}

/** Proposal summary for the audit payload — ids/types/path only, no payload. */
function summarizeProposals(
  response: CopilotCustomApiResponse,
): string {
  const slim = response.proposals.map((p) => ({
    id: p.id,
    actionType: p.actionType,
    governedWritePath: p.governedWritePath,
    requireConfirmation: p.requireConfirmation,
    riskLevel: p.riskLevel,
  }));
  return JSON.stringify(slim);
}

export function buildCopilotAuditCompletionEvent(
  request: CopilotCustomApiRequest,
  response: CopilotCustomApiResponse,
  options: CopilotAuditBuildOptions = {},
): CopilotAuditEventPayload {
  return {
    ...baseFromRequest(request, 'audit_completion', options),
    modelDeployment: options.modelDeployment,
    modelVersion: options.modelVersion,
    responseMode: response.mode,
    isLive: response.isLive,
    failClosedCode: response.failClosedCode,
    warningsJson: JSON.stringify(response.warnings ?? []),
    proposalsJson: summarizeProposals(response),
    proposalCount: response.proposals.length,
  };
}

export function buildCopilotAuditFailClosedEvent(
  request: CopilotCustomApiRequest,
  failClosedCode: CopilotFailClosedCode,
  reason: string,
  options: CopilotAuditBuildOptions = {},
): CopilotAuditEventPayload {
  return {
    ...baseFromRequest(request, 'audit_fail_closed', options),
    failClosedCode,
    errorSummary: reason,
  };
}

// ---------------------------------------------------------------------------
// Pure validation — enforce the Phase 137I privacy + completeness contract.
// ---------------------------------------------------------------------------

export interface CopilotAuditValidation {
  ok: boolean;
  errors: ReadonlyArray<string>;
}

/** Free-text fields scanned for raw-doc / secret markers (never hashes). */
function freeTextValues(event: CopilotAuditEventPayload): string[] {
  return [
    event.redactedPromptSummary,
    event.contextSummary,
    event.warningsJson,
    event.proposalsJson,
    event.errorSummary,
    event.errorClass,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
}

// Raw borrower-document markers (a redacted summary must never carry these).
const RAW_DOC_PATTERNS: ReadonlyArray<RegExp> = [
  /raw[\s_-]?borrower[\s_-]?doc/i,
  /begin[\s_-]?borrower[\s_-]?document/i,
  /data:[^;\s]+;base64,/i,
  /-----begin [a-z ]+-----/i,
];

// Secret / token / key markers. Written WITHOUT a trailing ":"/"=" so the
// static governance scans (which look for `api[_-]?key\s*[:=]`) do not flag
// this detector module.
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bsk-[A-Za-z0-9]{8,}/,
  /\bbearer\s+[A-Za-z0-9._-]+/i,
  /\bapi[_-]?key\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /[A-Za-z0-9+/=_-]{40,}/,
];

export function validateCopilotAuditEvent(
  event: CopilotAuditEventPayload,
): CopilotAuditValidation {
  const errors: string[] = [];

  if (!event.correlationId) errors.push('correlationId is required.');
  if (!event.eventType) {
    errors.push('eventType is required.');
  } else if (
    !(COPILOT_AUDIT_EVENT_TYPES as ReadonlyArray<string>).includes(event.eventType)
  ) {
    errors.push(`Unknown eventType "${event.eventType}".`);
  }
  if (!event.payloadVersion) errors.push('payloadVersion is required.');

  // Privacy: prompt/context must be summary/hash only.
  for (const value of freeTextValues(event)) {
    if (RAW_DOC_PATTERNS.some((re) => re.test(value))) {
      errors.push('A raw borrower-document marker was detected; summaries/hashes only.');
      break;
    }
  }
  for (const value of freeTextValues(event)) {
    if (SECRET_PATTERNS.some((re) => re.test(value))) {
      errors.push('A secret / token / API-key marker was detected in an audit field.');
      break;
    }
  }

  // Per-event-type completeness.
  if (event.eventType === 'audit_start') {
    if (!event.userUpn) errors.push('audit_start requires userUpn.');
    if (!event.workspace) errors.push('audit_start requires workspace.');
    if (!event.surface) errors.push('audit_start requires surface.');
    if (!event.mode) errors.push('audit_start requires mode.');
    if (!event.promptKind) errors.push('audit_start requires promptKind.');
  }
  if (event.eventType === 'audit_completion') {
    if (!event.responseMode) errors.push('audit_completion requires responseMode.');
    if (typeof event.isLive !== 'boolean') {
      errors.push('audit_completion requires isLive.');
    }
    if (typeof event.proposalCount !== 'number') {
      errors.push('audit_completion requires proposalCount.');
    }
  }
  if (event.eventType === 'audit_fail_closed') {
    if (!event.failClosedCode) errors.push('audit_fail_closed requires failClosedCode.');
  }
  if (event.eventType === 'proposal_confirmed') {
    if (!event.confirmedProposalId) {
      errors.push('proposal_confirmed requires confirmedProposalId.');
    }
    if (!event.confirmationStatus) {
      errors.push('proposal_confirmed requires confirmationStatus.');
    }
  }
  if (event.eventType === 'governed_write_completed') {
    if (!event.confirmedProposalId) {
      errors.push('governed_write_completed requires confirmedProposalId.');
    }
    if (!event.governedWritePath) {
      errors.push('governed_write_completed requires governedWritePath.');
    }
    if (!event.governedWriteId) {
      errors.push('governed_write_completed requires governedWriteId.');
    }
  }

  return { ok: errors.length === 0, errors };
}
