/**
 * Phase 137E — Copilot Dataverse Custom API transport STUB / factory.
 *
 * This is the clearly-isolated boundary where a FUTURE phase will plug in
 * the real server-bound transport that calls the Dataverse Custom API
 * (`cr664_RunLosCopilotAssist`), which in turn calls Azure OpenAI
 * server-side. In Phase 137E it is a FAIL-CLOSED STUB:
 *
 *   - `createCopilotDataverseCustomApiTransport(...)` returns a transport
 *     whose `invoke(...)` resolves to a `disabled` / `missing_config`
 *     response — never a fake answer, never `isLive`, never a proposal.
 *
 * It makes NO network call, reads NO secret, imports NO `fetch`, reads NO
 * `import.meta.env`, creates NO Dataverse/HTTP client, and imports NO
 * generated Dataverse write service. The future live implementation belongs
 * SERVER-SIDE behind the Dataverse Custom API — not in this browser bundle.
 */

import {
  createDisabledCopilotResponse,
  type CopilotCustomApiRequest,
  type CopilotCustomApiResponse,
} from './copilotCustomApiContract';
import type { CopilotCustomApiTransport } from './copilotCustomApiAdapter';
// Single source of truth for the Custom API name (Phase 137B/137D).
import { COPILOT_CUSTOM_API_NAME } from './copilotConnectorConfig';

export { COPILOT_CUSTOM_API_NAME };

/**
 * Symbolic-only factory options. A real transport is configured by a
 * SYMBOLIC alias (resolved server-side), never a URL and never a secret.
 */
export interface CopilotDataverseCustomApiTransportFactoryOptions {
  /** Symbolic alias only (e.g. 'dataverse-custom-api'); never a URL. */
  endpointAlias: string;
  /** Exact Custom API name. Defaults to COPILOT_CUSTOM_API_NAME. */
  customApiName?: typeof COPILOT_CUSTOM_API_NAME;
  /** Symbolic policy version tag (non-secret). */
  policyVersion?: string;
}

/** Greppable marker — the stub is intentionally not a live implementation. */
export const COPILOT_TRANSPORT_NOT_IMPLEMENTED = 'transport_not_implemented';

function aliasLooksLikeUrl(alias: string): boolean {
  return /:\/\/|^https?:/i.test(alias) || alias.includes('.');
}

/**
 * Create the (fail-closed) Dataverse Custom API transport.
 *
 * Phase 137E: the returned transport ALWAYS fails closed. Its `invoke`
 * resolves to a `disabled` response with `failClosedCode: 'missing_config'`
 * and an honest reason — it does not throw, so the adapter/UI never crash,
 * and it never fabricates output. A future phase replaces the body of
 * `invoke` with a real server-bound call (still gated by config + policy).
 */
export function createCopilotDataverseCustomApiTransport(
  options: CopilotDataverseCustomApiTransportFactoryOptions,
): CopilotCustomApiTransport {
  const apiName = options.customApiName ?? COPILOT_CUSTOM_API_NAME;
  const aliasIsUrl = aliasLooksLikeUrl(options.endpointAlias);

  const reason = aliasIsUrl
    ? 'Copilot Custom API transport requires a SYMBOLIC endpoint alias, not a ' +
      `URL. The live transport (${COPILOT_TRANSPORT_NOT_IMPLEMENTED}) is not wired.`
    : `Copilot Dataverse Custom API transport (${apiName}) is not implemented ` +
      `yet (${COPILOT_TRANSPORT_NOT_IMPLEMENTED}). No live call is made; failing ` +
      'closed. The real transport lives server-side behind the Custom API.';

  return {
    // No network. No secret. No client. Just an honest fail-closed response.
    invoke(request: CopilotCustomApiRequest): Promise<CopilotCustomApiResponse> {
      return Promise.resolve(
        createDisabledCopilotResponse(
          request.correlationId,
          'missing_config',
          reason,
        ),
      );
    },
  };
}
