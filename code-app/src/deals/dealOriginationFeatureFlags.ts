/**
 * Phase 171-180 -- Deal origination operating arc: feature flags.
 *
 * Pure, fail-closed gates for the banker create path and EVERY downstream
 * automation domain. No IO, no env/secret reads. An absent / malformed config
 * leaves a gate off. Each domain is gated independently so creating a deal
 * never secretly performs every automation.
 *
 * NOTE: most of these are still hard `false` constants -- a later, separately
 * certified phase flips a specific domain only after its dependency readiness,
 * authorization, approved references, and audit path are proven. THREE domains
 * have since been deliberately armed to `true` (Completion Phase A / WF-1A):
 * AUTO_STAGE_ADVANCE_ENABLED, TASK_GENERATION_ENABLED, DUPLICATE_DETECTION_ENABLED
 * -- see each constant's own comment for its evidence trail. Do not assume
 * "defaults DISABLED" holds for the whole module; check the individual constant.
 */

// ---------------------------------------------------------------------------
// Hard default constants (all OFF this phase)
// ---------------------------------------------------------------------------

export const BANKER_NEW_DEAL_CREATE_ENABLED = false as const;
export const CRM_AUTOMATION_ENABLED = false as const;
export const BORROWER_INVITE_AUTOMATION_ENABLED = false as const;
// Completion Phase A — reset to the SAFE DEFAULT (off). A live-write flag must never assert a
// domain up by source default; it is armed deliberately, per domain, only once that domain's
// authentic evidence + verified schema state + transport are real (operator runbook O5–O7).
// The runtime schema/transport gates remain the second safety layer.
export const AUTO_STAGE_ADVANCE_ENABLED = true as const;
export const TASK_GENERATION_ENABLED = true as const;
// Completion Phase A — safe default (off); arm only after the live checklist write transport is
// injected and a real document-checklist smoke is captured.
export const DOCUMENT_CHECKLIST_GENERATION_ENABLED = false as const;
export const PORTFOLIO_SIDE_EFFECTS_ENABLED = false as const;
// Completion Phase A — borrower send is the highest-risk domain (live email). Safe default
// (off); arm only after the Outlook connector is registered, the SDK regenerated, and a real
// approved-recipient send with a captured delivery receipt + named approver is recorded.
export const BORROWER_MESSAGING_ENABLED = false as const;
/** Completion Phase A — borrower email transport safe default (off); armed with messaging. */
export const BORROWER_EMAIL_TRANSPORT_ENABLED = false as const;
export const BORROWER_SMS_TRANSPORT_ENABLED = false as const;
export const BORROWER_TWILIO_TRANSPORT_ENABLED = false as const;
/** Duplicate detection may run as a warning; merge is never auto-applied. */
export const DUPLICATE_DETECTION_ENABLED = true as const;
export const DUPLICATE_MERGE_APPLY_ENABLED = false as const;

/** Borrower-invite / messaging mode for the controlled path. */
export type SendMode = 'disabled' | 'prepare_only' | 'send_enabled';

export interface DealOriginationFeatureFlagConfig {
  readonly bankerCreateEnabled?: boolean;
  readonly crmAutomationEnabled?: boolean;
  readonly borrowerInviteMode?: SendMode;
  readonly autoStageAdvanceEnabled?: boolean;
  readonly taskGenerationEnabled?: boolean;
  readonly documentChecklistEnabled?: boolean;
  readonly portfolioSideEffectsEnabled?: boolean;
  readonly borrowerMessagingMode?: SendMode;
  readonly borrowerEmailTransportEnabled?: boolean;
  readonly borrowerSmsTransportEnabled?: boolean;
  readonly borrowerTwilioTransportEnabled?: boolean;
  readonly duplicateDetectionEnabled?: boolean;
  readonly duplicateMergeApplyEnabled?: boolean;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const SEND_MODES: readonly string[] = ['disabled', 'prepare_only', 'send_enabled'];

/** A present-but-wrong-shape config is malformed and fails closed. */
export function isMalformedOriginationConfig(config: unknown): boolean {
  if (config === undefined) return false;
  if (!isPlainRecord(config)) return true;
  const boolFields = [
    'bankerCreateEnabled',
    'crmAutomationEnabled',
    'autoStageAdvanceEnabled',
    'taskGenerationEnabled',
    'documentChecklistEnabled',
    'portfolioSideEffectsEnabled',
    'borrowerEmailTransportEnabled',
    'borrowerSmsTransportEnabled',
    'borrowerTwilioTransportEnabled',
    'duplicateDetectionEnabled',
    'duplicateMergeApplyEnabled',
  ];
  for (const f of boolFields) {
    if (f in config && typeof config[f] !== 'boolean') return true;
  }
  for (const f of ['borrowerInviteMode', 'borrowerMessagingMode']) {
    if (f in config && !SEND_MODES.includes(config[f] as string)) return true;
  }
  return false;
}

/**
 * Resolve a single domain's enablement. Fail-closed: the hard constant must be
 * `true` (it is not this phase) AND the config value must be exactly `true`.
 * Because the constants are hard `false`, every domain resolves to OFF for the
 * app default; tests pass explicit deps to exercise enabled paths.
 */
function gate(hardConstant: boolean, configValue: boolean | undefined): boolean {
  if (hardConstant !== true) return false;
  return configValue === true;
}

export function isBankerCreateEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return gate(BANKER_NEW_DEAL_CREATE_ENABLED, config?.bankerCreateEnabled);
}
export function isCrmAutomationEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return gate(CRM_AUTOMATION_ENABLED, config?.crmAutomationEnabled);
}
export function isAutoStageAdvanceEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return gate(AUTO_STAGE_ADVANCE_ENABLED, config?.autoStageAdvanceEnabled);
}
export function isTaskGenerationEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return gate(TASK_GENERATION_ENABLED, config?.taskGenerationEnabled);
}
export function isDocumentChecklistEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return gate(DOCUMENT_CHECKLIST_GENERATION_ENABLED, config?.documentChecklistEnabled);
}
export function isPortfolioSideEffectsEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return gate(PORTFOLIO_SIDE_EFFECTS_ENABLED, config?.portfolioSideEffectsEnabled);
}
export function isDuplicateDetectionEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return gate(DUPLICATE_DETECTION_ENABLED, config?.duplicateDetectionEnabled);
}
export function isDuplicateMergeApplyEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  // Merge apply is gated by BOTH the hard constant and the detection gate; it
  // is never enabled in this arc.
  if (isMalformedOriginationConfig(config)) return false;
  return gate(DUPLICATE_MERGE_APPLY_ENABLED, config?.duplicateMergeApplyEnabled);
}

/** Resolve a send-mode domain, fail-closed to 'disabled'. */
export function resolveBorrowerInviteMode(config?: DealOriginationFeatureFlagConfig): SendMode {
  if (isMalformedOriginationConfig(config)) return 'disabled';
  if ((BORROWER_INVITE_AUTOMATION_ENABLED as boolean) !== true) return 'disabled';
  const mode = config?.borrowerInviteMode;
  return mode === 'prepare_only' || mode === 'send_enabled' ? mode : 'disabled';
}
export function resolveBorrowerMessagingMode(config?: DealOriginationFeatureFlagConfig): SendMode {
  if (isMalformedOriginationConfig(config)) return 'disabled';
  if ((BORROWER_MESSAGING_ENABLED as boolean) !== true) return 'disabled';
  const mode = config?.borrowerMessagingMode;
  return mode === 'prepare_only' || mode === 'send_enabled' ? mode : 'disabled';
}

/** Whether ANY external transport is enabled (default: none). */
export function isAnyBorrowerTransportEnabled(config?: DealOriginationFeatureFlagConfig): boolean {
  if (isMalformedOriginationConfig(config)) return false;
  return (
    gate(BORROWER_EMAIL_TRANSPORT_ENABLED, config?.borrowerEmailTransportEnabled) ||
    gate(BORROWER_SMS_TRANSPORT_ENABLED, config?.borrowerSmsTransportEnabled) ||
    gate(BORROWER_TWILIO_TRANSPORT_ENABLED, config?.borrowerTwilioTransportEnabled)
  );
}
