/**
 * Phase 137C — Copilot Custom API adapter SKELETON (disabled by default).
 *
 * This is the inert boundary that a FUTURE Phase 137D+ live transport will
 * plug into. It defines:
 *   - a pure request builder that maps already-authorized context into the
 *     Phase 137B request shape (no IO, no enrichment, no fetch);
 *   - an optional server-only transport interface; and
 *   - a runner that, WITHOUT an injected transport, immediately returns a
 *     fail-closed not-configured response.
 *
 * It makes NO network call, reads NO secret, creates NO Dataverse client,
 * and calls NO Azure OpenAI endpoint. There is no default transport, so
 * the runtime stays not_configured exactly as before.
 */

import {
  createDisabledCopilotResponse,
  createNotConfiguredCopilotResponse,
  validateCopilotResponse,
  type CopilotCustomApiContext,
  type CopilotCustomApiPolicy,
  type CopilotCustomApiPrompt,
  type CopilotCustomApiRequest,
  type CopilotCustomApiResponse,
  type CopilotCustomApiUser,
  type CopilotRequestMode,
  type CopilotSurface,
  type CopilotWorkspace,
} from './copilotCustomApiContract';
import type { CopilotConnectorConfig } from './copilotConnectorConfig';

// ---------------------------------------------------------------------------
// Pure request builder
// ---------------------------------------------------------------------------

export interface BuildCopilotCustomApiRequestInput {
  workspace: CopilotWorkspace;
  surface: CopilotSurface;
  mode: CopilotRequestMode;
  user: CopilotCustomApiUser;
  /** Already-authorized UI / view-model context. Used as-is. */
  context: CopilotCustomApiContext;
  prompt: CopilotCustomApiPrompt;
  policy: CopilotCustomApiPolicy;
  correlationId: string;
}

/**
 * Pure mapper: assemble the Custom API request from already-authorized
 * inputs. It does NOT fetch, query, or enrich the context — the caller
 * passes the exact context the surface already rendered, and the builder
 * passes it through unchanged.
 */
export function buildCopilotCustomApiRequest(
  input: BuildCopilotCustomApiRequestInput,
): CopilotCustomApiRequest {
  return {
    workspace: input.workspace,
    surface: input.surface,
    mode: input.mode,
    user: input.user,
    context: input.context,
    prompt: input.prompt,
    policy: input.policy,
    correlationId: input.correlationId,
  };
}

// ---------------------------------------------------------------------------
// Transport boundary (server-only; NOT implemented this phase)
// ---------------------------------------------------------------------------

/**
 * SERVER-ONLY live-call boundary. A real implementation lives behind the
 * Dataverse Custom API (`cr664_RunLosCopilotAssist`) and is injected by a
 * future phase. It is intentionally NOT implemented here, so no secret, no
 * fetch, and no Azure OpenAI client ship in the bundle.
 */
export interface CopilotCustomApiTransport {
  invoke(request: CopilotCustomApiRequest): Promise<CopilotCustomApiResponse>;
}

export interface RunCopilotCustomApiOptions {
  /**
   * Resolved (non-secret) connector config — Phase 137D. Absent or
   * `not_configured` → not_configured response; `disabled` → disabled
   * response; a live mode is required before the transport is ever called.
   */
  config?: CopilotConnectorConfig;
  /** Injected by a future phase. Absent today → fail closed. */
  transport?: CopilotCustomApiTransport;
}

const NOT_CONFIGURED_REASON =
  'Copilot Custom API is not configured. No live call is made; the ' +
  'connector is not_configured.';

const NO_TRANSPORT_REASON =
  'Copilot Custom API transport is not wired. No live call is made; the ' +
  'connector fails closed.';

/**
 * Run the Custom API behind the Phase 137D config + transport seam.
 *
 * Resolution order (fail-closed):
 *   1. No config or `not_configured`            → not_configured response.
 *   2. `disabled`                               → disabled response.
 *   3. Live mode (`live_read_only`/`proposal_only`) but no transport
 *                                               → disabled (missing_config).
 *   4. Live mode + transport                    → invoke, validate, and fail
 *                                                 closed to disabled on an
 *                                                 invalid/unsafe response or
 *                                                 a thrown error.
 *
 * This function performs no IO itself. The only path that could touch the
 * network is the injected `transport.invoke`, which does not exist today —
 * and it is reachable ONLY in a resolved live mode.
 */
export async function runCopilotCustomApi(
  request: CopilotCustomApiRequest,
  options: RunCopilotCustomApiOptions = {},
): Promise<CopilotCustomApiResponse> {
  const { config, transport } = options;

  // 1. No config / not_configured → honest not_configured.
  if (!config || config.mode === 'not_configured') {
    return createNotConfiguredCopilotResponse(
      request.correlationId,
      config?.reason ?? NOT_CONFIGURED_REASON,
    );
  }

  // 2. Explicitly disabled → honest disabled.
  if (config.mode === 'disabled') {
    return createDisabledCopilotResponse(
      request.correlationId,
      'missing_config',
      config.reason ?? 'Copilot is disabled by configuration.',
    );
  }

  // 3. Live mode requires an injected (server-only) transport. None today.
  if (!transport) {
    return createDisabledCopilotResponse(
      request.correlationId,
      'missing_config',
      NO_TRANSPORT_REASON,
    );
  }

  // 4. Live mode + transport — invoke only here. We never trust the
  //    transport blindly: validate and fail closed on anything unsafe.
  try {
    const response = await transport.invoke(request);
    const validation = validateCopilotResponse(response);
    if (!validation.ok) {
      return createDisabledCopilotResponse(
        request.correlationId,
        'connector_exception',
        `Copilot response failed validation: ${validation.errors.join('; ')}`,
      );
    }
    return response;
  } catch (err) {
    return createDisabledCopilotResponse(
      request.correlationId,
      'connector_exception',
      err instanceof Error ? err.message : String(err),
    );
  }
}
