/**
 * Phase 137L — Copilot server handler (DISABLED skeleton, inert).
 *
 * App-side, pure TypeScript model of how the FUTURE server-side handler
 * behind the Dataverse Custom API (`cr664_RunLosCopilotAssist`) will run:
 * validate → audit_start → (future) model call → audit_completion. In
 * Phase 137L it is DISABLED and FAIL-CLOSED:
 *
 *   - It validates the request shape and fails closed before the model
 *     boundary on any violation.
 *   - It attempts `audit_start` via the injected audit logger; the only
 *     logger that exists is the disabled one (Phase 137K), so this fails
 *     closed with `audit_unavailable` and the model boundary is NEVER
 *     reached.
 *   - Even if a (test) logger reports audit success, the handler still does
 *     NOT invoke the model boundary — live mode is not enabled in 137L, so
 *     it returns `not_configured`.
 *
 * It performs NO IO: no `fetch`, no Dataverse write, no Azure OpenAI call,
 * no secret, no network. The model boundary is an INTERFACE only — never
 * implemented, never invoked here.
 */

import {
  createDisabledCopilotResponse,
  createNotConfiguredCopilotResponse,
  type CopilotCustomApiRequest,
  type CopilotCustomApiResponse,
} from './copilotCustomApiContract';
import {
  buildCopilotAuditStartEvent,
  createDisabledCopilotAuditLogger,
  type CopilotAuditBuildOptions,
  type CopilotAuditLogger,
} from './copilotAuditLogger';

/**
 * SERVER-ONLY model boundary. A future phase implements this behind the
 * approved Azure OpenAI server boundary. It is an INTERFACE only here — the
 * disabled handler never constructs or invokes it.
 */
export interface CopilotModelBoundary {
  invoke(request: CopilotCustomApiRequest): Promise<unknown>;
}

export interface CopilotServerHandlerDependencies {
  /** Injected audit logger. Absent → disabled logger (fails closed). */
  auditLogger?: CopilotAuditLogger;
  /** Interface only — NEVER invoked in Phase 137L. */
  modelBoundary?: CopilotModelBoundary;
  /** Redacted prompt/context summaries + model/policy version for the audit. */
  auditOptions?: CopilotAuditBuildOptions;
}

export interface CopilotServerHandlerResult {
  response: CopilotCustomApiResponse;
  /** True once the handler attempted to write the audit_start event. */
  auditAttempted: boolean;
  /** Always false in Phase 137L — the model boundary is never invoked. */
  modelInvoked: boolean;
}

const WORKSPACES = ['banker', 'manager', 'portfolio', 'team', 'executive'];
const SURFACES = ['deal', 'workspace'];
const REQUEST_MODES = ['live_read_only', 'proposal_only'];

/** Pure: validate the request shape the handler requires before any work. */
function validateServerHandlerRequest(
  request: CopilotCustomApiRequest,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!request || typeof request !== 'object') {
    return { ok: false, errors: ['request is missing'] };
  }
  if (!request.correlationId) errors.push('correlationId is required');
  if (!WORKSPACES.includes(request.workspace)) errors.push('invalid workspace');
  if (!SURFACES.includes(request.surface)) errors.push('invalid surface');
  if (!REQUEST_MODES.includes(request.mode)) errors.push('invalid mode');
  if (!request.prompt || !request.prompt.kind) errors.push('prompt.kind is required');
  if (!request.user || !request.user.upn) errors.push('user.upn is required');
  if (!request.policy || request.policy.requireConfirmation !== true) {
    errors.push('policy.requireConfirmation must be true');
  }
  return { ok: errors.length === 0, errors };
}

const LIVE_NOT_ENABLED_REASON =
  'Live Copilot is not enabled (Phase 137L readiness bundle). The server ' +
  'handler is disabled and never reaches the model boundary.';

/**
 * Run the (disabled) server handler. Resolution order (fail-closed):
 *   1. invalid request                 → disabled (policy_blocked), no audit, no model.
 *   2. audit_start write fails          → disabled (audit_unavailable), no model.
 *   3. audit_start write "succeeds"     → not_configured (live not enabled), no model.
 *
 * The model boundary is NEVER invoked in Phase 137L (modelInvoked stays
 * false). This function performs no IO itself; the only injected side
 * effect is `auditLogger.writeEvent`, whose only implementation today is
 * the disabled (no-op) logger.
 */
export async function runCopilotServerHandler(
  request: CopilotCustomApiRequest,
  deps: CopilotServerHandlerDependencies = {},
): Promise<CopilotServerHandlerResult> {
  const correlationId = request?.correlationId ?? 'unknown';

  // 1. Validate request shape — fail closed BEFORE any audit/model work.
  const validation = validateServerHandlerRequest(request);
  if (!validation.ok) {
    return {
      response: createDisabledCopilotResponse(
        correlationId,
        'policy_blocked',
        `Invalid Copilot request: ${validation.errors.join('; ')}`,
      ),
      auditAttempted: false,
      modelInvoked: false,
    };
  }

  // 2. Attempt audit_start. No logger → disabled logger (fails closed).
  const logger =
    deps.auditLogger ??
    createDisabledCopilotAuditLogger('No audit logger configured (Phase 137L).');
  const startEvent = buildCopilotAuditStartEvent(request, deps.auditOptions ?? {});
  const auditResult = await logger.writeEvent(startEvent);

  if (!auditResult.ok) {
    // Audit-before-model rule: cannot write audit_start → fail closed and
    // NEVER reach the model boundary.
    return {
      response: createDisabledCopilotResponse(
        correlationId,
        'audit_unavailable',
        auditResult.reason ?? 'Audit start could not be written; failing closed.',
      ),
      auditAttempted: true,
      modelInvoked: false,
    };
  }

  // 3. Audit start succeeded, but Phase 137L enables NO live path — the
  //    model boundary is intentionally not invoked. A future phase wires
  //    the model call here only after every live gate passes.
  return {
    response: createNotConfiguredCopilotResponse(correlationId, LIVE_NOT_ENABLED_REASON),
    auditAttempted: true,
    modelInvoked: false,
  };
}

export interface DisabledCopilotServerHandler {
  run(request: CopilotCustomApiRequest): Promise<CopilotServerHandlerResult>;
}

/**
 * Create the disabled handler bound to its dependencies. Defaults to the
 * disabled audit logger; never invokes the model boundary.
 */
export function createDisabledCopilotServerHandler(
  deps: CopilotServerHandlerDependencies = {},
): DisabledCopilotServerHandler {
  return {
    run(request: CopilotCustomApiRequest): Promise<CopilotServerHandlerResult> {
      return runCopilotServerHandler(request, deps);
    },
  };
}
