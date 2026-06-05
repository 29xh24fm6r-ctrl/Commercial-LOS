/**
 * Phase 137L — Copilot live transport harness (DISABLED, test-only seam).
 *
 * A pure, inert composition seam that wires together the existing inert
 * pieces of the Copilot live runway — config resolver (137D), fail-closed
 * transport stub (137E), disabled audit logger (137K), and the disabled
 * server handler (137L) — so a future phase has one place to compose them.
 *
 * It defaults DISABLED: the config resolves `not_configured`, the transport
 * is the fail-closed stub, the audit logger is the disabled no-op, and the
 * readiness evaluation always reports `ready: false`. It performs NO IO:
 * no network, no Dataverse invocation, no Azure OpenAI call, no secret.
 */

import {
  resolveCopilotConnectorConfig,
  type CopilotConnectorConfig,
} from './copilotConnectorConfig';
import {
  createCopilotDataverseCustomApiTransport,
  type CopilotDataverseCustomApiTransportFactoryOptions,
} from './copilotDataverseCustomApiTransport';
import type { CopilotCustomApiTransport } from './copilotCustomApiAdapter';
import {
  createDisabledCopilotAuditLogger,
  type CopilotAuditLogger,
} from './copilotAuditLogger';
import {
  createDisabledCopilotServerHandler,
  type DisabledCopilotServerHandler,
} from './copilotServerHandler';

export interface CopilotLiveReadiness {
  /** Always false in Phase 137L. */
  ready: boolean;
  blockers: ReadonlyArray<string>;
}

/**
 * Pure: the blockers that must ALL clear before live Copilot can be
 * enabled. None of them is cleared in Phase 137L, so `ready` is always
 * false.
 */
export function evaluateCopilotLiveReadiness(): CopilotLiveReadiness {
  const blockers: string[] = [
    'Audit table (cr664_copilotauditevent) not created.',
    'Custom API (cr664_RunLosCopilotAssist) not verified.',
    'Server handler not deployed.',
    'Azure OpenAI model / DLP policy not approved.',
    'Live mode not enabled (config resolves not_configured).',
  ];
  return { ready: blockers.length === 0, blockers };
}

export interface DisabledCopilotLiveHarness {
  /** Resolved config — `not_configured` with no env. */
  config: CopilotConnectorConfig;
  /** Fail-closed transport stub (no network). */
  transport: CopilotCustomApiTransport;
  /** Disabled audit logger (fails closed audit_unavailable). */
  auditLogger: CopilotAuditLogger;
  /** Disabled server handler (never reaches the model boundary). */
  handler: DisabledCopilotServerHandler;
  /** Readiness evaluation — always not ready in 137L. */
  readiness: CopilotLiveReadiness;
}

/**
 * Compose the inert pieces into a disabled harness. No network, no live
 * mode, no Azure OpenAI. The endpoint alias is symbolic only.
 */
export function createDisabledCopilotLiveHarness(): DisabledCopilotLiveHarness {
  const transportOptions: CopilotDataverseCustomApiTransportFactoryOptions = {
    endpointAlias: 'dataverse-custom-api',
  };
  const config = resolveCopilotConnectorConfig({});
  const transport = createCopilotDataverseCustomApiTransport(transportOptions);
  const auditLogger = createDisabledCopilotAuditLogger(
    'Disabled Copilot live harness (Phase 137L).',
  );
  const handler = createDisabledCopilotServerHandler({ auditLogger });
  return {
    config,
    transport,
    auditLogger,
    handler,
    readiness: evaluateCopilotLiveReadiness(),
  };
}
