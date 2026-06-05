/**
 * Phase 137C — Copilot Custom API contract (TYPES + pure validators).
 *
 * TypeScript-only realization of the future server-side Dataverse Custom
 * API contract specified in
 * docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md
 * (`cr664_RunLosCopilotAssist`). This module defines the request/response
 * shapes and the PURE validators/helpers a future transport must satisfy.
 *
 * It implements NO transport, makes NO network call, reads NO secret, and
 * resolves NOTHING to a live mode. It is the inert, disabled-by-default
 * boundary the future Phase 137D+ live adapter will plug into. The
 * existing not-configured Copilot runtime is unchanged.
 */

// ---------------------------------------------------------------------------
// Enumerations (per Phase 137B)
// ---------------------------------------------------------------------------

export type CopilotWorkspace =
  | 'banker'
  | 'manager'
  | 'portfolio'
  | 'team'
  | 'executive';

export type CopilotSurface = 'deal' | 'workspace';

export type CopilotMode =
  | 'not_configured'
  | 'disabled'
  | 'live_read_only'
  | 'proposal_only';

export type CopilotPromptKind =
  | 'summarize'
  | 'next_best_action'
  | 'draft_questions'
  | 'explain_risk'
  | 'prepare_review';

export type CopilotProposalActionType =
  | 'request_document'
  | 'draft_borrower_message'
  | 'create_task'
  | 'flag_for_review'
  | 'prepare_credit_memo'
  | 'explain_only';

export type CopilotRiskLevel = 'low' | 'medium' | 'high';

export type CopilotFailClosedCode =
  | 'missing_config'
  | 'policy_blocked'
  | 'dlp_blocked'
  | 'model_unavailable'
  | 'context_too_large'
  | 'unsafe_output'
  | 'audit_unavailable'
  | 'connector_exception';

// ---------------------------------------------------------------------------
// Canonical sets (single source of truth for the validators)
// ---------------------------------------------------------------------------

/** Every mode the contract recognizes. */
export const KNOWN_COPILOT_MODES: ReadonlyArray<CopilotMode> = [
  'not_configured',
  'disabled',
  'live_read_only',
  'proposal_only',
];

/** Fail-closed (non-live) modes — must never carry a live answer/proposal. */
export const FAIL_CLOSED_COPILOT_MODES: ReadonlyArray<CopilotMode> = [
  'not_configured',
  'disabled',
];

/** The closed allowlist of proposal action types. */
export const ALLOWED_COPILOT_ACTION_TYPES: ReadonlyArray<CopilotProposalActionType> = [
  'request_document',
  'draft_borrower_message',
  'create_task',
  'flag_for_review',
  'prepare_credit_memo',
  'explain_only',
];

/**
 * Read-only action type that never routes a write — the safe floor. Every
 * OTHER allowlisted action type is write-capable ONLY after explicit human
 * confirmation through a named governed write path.
 */
export const READ_ONLY_COPILOT_ACTION_TYPE: CopilotProposalActionType =
  'explain_only';

// ---------------------------------------------------------------------------
// Request contract
// ---------------------------------------------------------------------------

export interface CopilotCustomApiUser {
  upn: string;
  profileId?: string;
  workspaceName?: string;
}

/**
 * Already-authorized UI / view-model context only. Built from data the
 * surface has ALREADY loaded; never a trigger for a new query, never
 * cross-workspace / cross-deal.
 */
export interface CopilotCustomApiContext {
  dealId?: string;
  dealName?: string;
  clientName?: string;
  stage?: string;
  status?: string;
  metrics?: Record<string, unknown>;
  flags?: ReadonlyArray<string>;
  /** Document METADATA only (id/type/status) — never raw document content. */
  documents?: ReadonlyArray<Record<string, unknown>>;
  tasks?: ReadonlyArray<Record<string, unknown>>;
}

export interface CopilotCustomApiPrompt {
  kind: CopilotPromptKind;
  text?: string;
}

export interface CopilotCustomApiPolicy {
  allowProposals: boolean;
  allowedActionTypes: ReadonlyArray<CopilotProposalActionType>;
  /** Hard-typed true — a request can never disable confirmation. */
  requireConfirmation: true;
}

/** Only live modes are ever requested; not_configured/disabled are responses. */
export type CopilotRequestMode = 'live_read_only' | 'proposal_only';

export interface CopilotCustomApiRequest {
  workspace: CopilotWorkspace;
  surface: CopilotSurface;
  mode: CopilotRequestMode;
  user: CopilotCustomApiUser;
  context: CopilotCustomApiContext;
  prompt: CopilotCustomApiPrompt;
  policy: CopilotCustomApiPolicy;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// Response contract
// ---------------------------------------------------------------------------

export interface CopilotProposal {
  id: string;
  actionType: CopilotProposalActionType;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  /** Hard-typed true — Copilot proposes; the human confirms and acts. */
  requireConfirmation: true;
  /**
   * The existing governed write path a confirmed proposal would route
   * through. Required for every write-capable action type; omitted only
   * for the read-only `explain_only` floor.
   */
  governedWritePath?: string;
  riskLevel: CopilotRiskLevel;
  auditReason: string;
}

export interface CopilotAuditReceipt {
  correlationId: string;
  eventId?: string;
  policyVersion?: string;
}

export interface CopilotCustomApiResponse {
  mode: CopilotMode;
  isLive: boolean;
  /** Present only for live modes; empty/omitted when fail-closed. */
  answer?: string;
  citations: ReadonlyArray<string>;
  proposals: ReadonlyArray<CopilotProposal>;
  warnings: ReadonlyArray<string>;
  audit: CopilotAuditReceipt;
  /** Set when a fail-closed (disabled/not_configured) response was produced. */
  failClosedCode?: CopilotFailClosedCode;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Type guard: is the given string an allowlisted proposal action type? */
export function isAllowedCopilotActionType(
  actionType: string,
): actionType is CopilotProposalActionType {
  return (ALLOWED_COPILOT_ACTION_TYPES as ReadonlyArray<string>).includes(
    actionType,
  );
}

/** Normalize an arbitrary string to a known mode; unknown → not_configured. */
export function normalizeCopilotMode(input: string | undefined): CopilotMode {
  const v = (input ?? '').trim();
  return (KNOWN_COPILOT_MODES as ReadonlyArray<string>).includes(v)
    ? (v as CopilotMode)
    : 'not_configured';
}

/** Honest not-configured response — no AI, no proposals, no fake answer. */
export function createNotConfiguredCopilotResponse(
  correlationId: string,
  reason: string,
): CopilotCustomApiResponse {
  return {
    mode: 'not_configured',
    isLive: false,
    citations: [],
    proposals: [],
    warnings: [reason],
    audit: { correlationId },
    failClosedCode: 'missing_config',
  };
}

/** Honest disabled / fail-closed response — names the code, no fake answer. */
export function createDisabledCopilotResponse(
  correlationId: string,
  code: CopilotFailClosedCode,
  reason: string,
): CopilotCustomApiResponse {
  return {
    mode: 'disabled',
    isLive: false,
    citations: [],
    proposals: [],
    warnings: [reason],
    audit: { correlationId },
    failClosedCode: code,
  };
}

export interface CopilotResponseValidation {
  ok: boolean;
  errors: ReadonlyArray<string>;
}

/**
 * Pure structural validator for a (future) Custom API response. Enforces
 * the Phase 137B safety contract so a malformed or unsafe transport
 * response can be rejected and replaced with a fail-closed response.
 */
export function validateCopilotResponse(
  response: CopilotCustomApiResponse,
): CopilotResponseValidation {
  const errors: string[] = [];

  if (!(KNOWN_COPILOT_MODES as ReadonlyArray<string>).includes(response.mode)) {
    errors.push(`Unknown mode "${response.mode}".`);
  }

  // Honest audit — every response carries a correlation id.
  if (!response.audit || !response.audit.correlationId) {
    errors.push('Response is missing an audit correlationId.');
  }

  const isFailClosed = (
    FAIL_CLOSED_COPILOT_MODES as ReadonlyArray<string>
  ).includes(response.mode);

  if (isFailClosed) {
    // Fail-closed modes must be honest: not live, no fabricated answer, no
    // proposals.
    if (response.isLive) {
      errors.push(`Fail-closed mode "${response.mode}" must not be isLive.`);
    }
    if (response.answer && response.answer.trim().length > 0) {
      errors.push(
        `Fail-closed mode "${response.mode}" must not return an answer.`,
      );
    }
    if (response.proposals.length > 0) {
      errors.push(
        `Fail-closed mode "${response.mode}" must not return proposals.`,
      );
    }
  }

  for (const p of response.proposals) {
    if (p.requireConfirmation !== true) {
      errors.push(`Proposal "${p.id}" must set requireConfirmation: true.`);
    }
    if (!isAllowedCopilotActionType(p.actionType)) {
      errors.push(`Proposal "${p.id}" has a non-allowlisted actionType "${p.actionType}".`);
    }
    const needsGovernedWrite = p.actionType !== READ_ONLY_COPILOT_ACTION_TYPE;
    if (
      needsGovernedWrite &&
      (!p.governedWritePath || p.governedWritePath.trim().length === 0)
    ) {
      errors.push(
        `Proposal "${p.id}" (${p.actionType}) requires a governedWritePath.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
