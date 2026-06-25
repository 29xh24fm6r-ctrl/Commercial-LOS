/**
 * Phase 171-180 -- Deal origination operating arc: feature flags.
 *
 * Pure, fail-closed gates for the banker create path and EVERY downstream
 * automation domain. No IO, no env/secret reads. Every gate defaults DISABLED;
 * an absent / malformed config leaves all gates off. Each domain is gated
 * independently so creating a deal never secretly performs every automation.
 *
 * NOTE: these are hard `false` constants this phase. A later, separately
 * certified phase flips a specific domain only after its dependency readiness,
 * authorization, approved references, and audit path are proven.
 */

// ---------------------------------------------------------------------------
// Hard default constants (all OFF this phase)
// ---------------------------------------------------------------------------

export const BANKER_NEW_DEAL_CREATE_ENABLED = false as const;
export const CRM_AUTOMATION_ENABLED = false as const;
export const BORROWER_INVITE_AUTOMATION_ENABLED = false as const;
// Phase 256B: flipped ON after the GO stage-advancement smoke (controlled transition + audit
// + timeline + readback). Production use is governed explicit advancement, never uncontrolled.
export const AUTO_STAGE_ADVANCE_ENABLED = true as const;
export const TASK_GENERATION_ENABLED = true as const;
// Phase 256B: flipped ON after the GO document-checklist smoke (live write transport +
// create/readback/update/cleanup). Runtime still requires authorized actor + preview match + audit.
export const DOCUMENT_CHECKLIST_GENERATION_ENABLED = true as const;
export const PORTFOLIO_SIDE_EFFECTS_ENABLED = false as const;
// Phase 256B: borrower send flipped ON after the GO borrower-send smoke (VITE_EMAIL_MODE=LIVE,
// approved test recipient, delivery + audit verified). Send stays an explicit banker action.
export const BORROWER_MESSAGING_ENABLED = true as const;
/** Phase 256B: the borrower email transport is enabled together with messaging. */
export const BORROWER_EMAIL_TRANSPORT_ENABLED = true as const;
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
