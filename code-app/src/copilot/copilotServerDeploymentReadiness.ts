/**
 * Phase 138C — Copilot server-handler deployment readiness (PURE checklist).
 *
 * App-side, pure TypeScript that evaluates whether the future server-side
 * handler behind the Dataverse Custom API (`cr664_RunLosCopilotAssist`) is
 * ready to deploy/enable. It performs NO IO: no `fetch`, no Dataverse call,
 * no Azure OpenAI call, no secret, no `import.meta.env`. It is a checklist
 * projector for docs / dashboards / a future enablement gate — it enables
 * nothing.
 *
 * In Phase 138C every external prerequisite is unmet, so `ready` is always
 * false. The runtime Copilot connector stays not_configured.
 */

export interface CopilotServerDeploymentPrerequisite {
  key: string;
  /** Human-readable requirement. */
  label: string;
  /**
   * Externally satisfied? In Phase 138C every prerequisite is `false`
   * (none can be satisfied from this repo alone). A future operator marks
   * these true only after the real, approved, test-tenant work exists.
   */
  satisfied: boolean;
}

/**
 * The ordered prerequisites for deploying / enabling the server handler
 * (Phase 137H spec + Phase 137I/137L). All `false` by default.
 */
export function copilotServerDeploymentPrerequisites(): ReadonlyArray<CopilotServerDeploymentPrerequisite> {
  return [
    { key: 'dlp_model_policy_approved', label: 'DLP + Azure OpenAI model policy approved.', satisfied: false },
    { key: 'azure_openai_deployment_approved', label: 'Azure OpenAI deployment approved.', satisfied: false },
    { key: 'managed_identity_or_secret_store', label: 'Managed identity / server-side secret store configured.', satisfied: false },
    { key: 'audit_table_created', label: 'cr664_copilotauditevent audit table created and verified.', satisfied: false },
    { key: 'custom_api_created', label: 'cr664_RunLosCopilotAssist Custom API created and verified.', satisfied: false },
    { key: 'server_handler_deployed', label: 'Server handler deployed (separate server project).', satisfied: false },
    { key: 'audit_start_verified', label: 'audit_start verified before any model call.', satisfied: false },
    { key: 'fail_closed_verified', label: 'Fail-closed (audit_unavailable / disabled) verified.', satisfied: false },
    { key: 'disable_switch_configured', label: 'Disable switch configured for live mode.', satisfied: false },
  ];
}

export interface CopilotServerDeploymentReadiness {
  /** True only when every prerequisite is satisfied. Always false in 138C. */
  ready: boolean;
  blockers: ReadonlyArray<string>;
  satisfied: ReadonlyArray<string>;
}

/**
 * Pure: derive the deployment-readiness verdict from the prerequisites.
 * Pass an override map (test-tenant operator simulation) to mark some
 * prerequisites satisfied; with no override, nothing is satisfied and the
 * verdict is `ready: false`.
 */
export function evaluateCopilotServerDeploymentReadiness(
  overrides: Readonly<Record<string, boolean>> = {},
): CopilotServerDeploymentReadiness {
  const prereqs = copilotServerDeploymentPrerequisites().map((p) => ({
    ...p,
    satisfied: overrides[p.key] ?? p.satisfied,
  }));
  const blockers = prereqs.filter((p) => !p.satisfied).map((p) => p.label);
  const satisfied = prereqs.filter((p) => p.satisfied).map((p) => p.label);
  return { ready: blockers.length === 0, blockers, satisfied };
}

/**
 * The handler entrypoint contract (Phase 137H/137I), as a documentation
 * constant — NOT an implementation. It describes the ordered server-side
 * pipeline the future handler must follow.
 */
export const COPILOT_SERVER_HANDLER_CONTRACT: ReadonlyArray<string> = [
  'Validate the request shape (Phase 137B contract); fail closed before the model boundary.',
  'Read the Dataverse execution context (caller identity from the platform, not client-asserted).',
  'Enforce workspace / surface / mode / action-allowlist + requireConfirmation=true.',
  'Minimize / redact the prompt + context.',
  'Check DLP / model policy + the disable switch.',
  'Write audit_start; if it cannot be written, fail closed audit_unavailable BEFORE any model call.',
  'Call Azure OpenAI SERVER-SIDE only (managed identity); never from the browser.',
  'Validate the model output against the response contract; unsafe/unparseable fails closed.',
  'Convert actions to proposal-only objects (allowlisted, requireConfirmation=true, governedWritePath).',
  'Write audit_completion (or audit_fail_closed).',
  'Return the response JSON; never execute a write directly from model output.',
];
