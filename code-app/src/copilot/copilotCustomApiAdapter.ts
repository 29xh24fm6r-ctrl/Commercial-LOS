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
  /** Injected by a future phase. Absent today → fail closed not_configured. */
  transport?: CopilotCustomApiTransport;
}

const NO_TRANSPORT_REASON =
  'Copilot Custom API transport is not configured. No live call is made; ' +
  'the connector is not_configured.';

/**
 * Run the Custom API. In Phase 137C there is NO transport, so this returns
 * a fail-closed not-configured response immediately — it never reaches a
 * network call. When a future phase injects a server-only transport, the
 * transport's response is structurally validated; an invalid/unsafe
 * response fails closed to `disabled` rather than reaching the UI.
 *
 * This function performs no IO itself. The only path that could touch the
 * network is the injected `transport.invoke`, which does not exist today.
 */
export async function runCopilotCustomApi(
  request: CopilotCustomApiRequest,
  options: RunCopilotCustomApiOptions = {},
): Promise<CopilotCustomApiResponse> {
  const transport = options.transport;
  if (!transport) {
    return createNotConfiguredCopilotResponse(
      request.correlationId,
      NO_TRANSPORT_REASON,
    );
  }

  // Future-phase path: a server-only transport is injected. We still never
  // trust it blindly — validate the response and fail closed on anything
  // that violates the safety contract.
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
