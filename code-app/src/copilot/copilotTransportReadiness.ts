/**
 * Phase 137E — Copilot transport readiness (PURE planning helper).
 *
 * A pure function that explains, given a resolved 137D
 * `CopilotConnectorConfig`, whether the live Dataverse Custom API transport
 * is ready to be enabled — and if not, exactly what blocks it. It performs
 * NO IO and changes NO runtime behavior; it is a checklist projector for
 * docs / dashboards / a future enablement gate.
 *
 * In Phase 137E `ready` is ALWAYS false: the live transport is not
 * implemented (137E ships a fail-closed stub), so at minimum that blocker
 * is always present.
 */

import type { CopilotConnectorConfig } from './copilotConnectorConfig';

export interface CopilotTransportReadiness {
  /** True only when there are zero blockers. Always false in Phase 137E. */
  ready: boolean;
  blockers: ReadonlyArray<string>;
  nextSteps: ReadonlyArray<string>;
}

const LIVE_MODES: ReadonlyArray<CopilotConnectorConfig['mode']> = [
  'live_read_only',
  'proposal_only',
];

/**
 * Pure: derive the readiness checklist from the resolved config. The
 * unconditional blockers reflect work that does not exist yet in the repo
 * (the live transport, audit logger, server registration, policy approval,
 * secret store). The config-derived blocker reflects whether the operator
 * has even requested a live mode.
 */
export function getCopilotTransportReadiness(
  config: CopilotConnectorConfig,
): CopilotTransportReadiness {
  const blockers: string[] = [];
  const nextSteps: string[] = [];

  // Config-derived blocker: a live mode must be requested (and must have
  // resolved — the 137D resolver fails closed to disabled/not_configured if
  // the live contract is incomplete or a secret is present).
  if (!(LIVE_MODES as ReadonlyArray<string>).includes(config.mode)) {
    blockers.push(
      `Connector config is not in a live mode (currently "${config.mode}"). ` +
        'Resolve a live_read_only / proposal_only config first.',
    );
    nextSteps.push(
      'Provide a complete, non-secret live config (exact Custom API name, ' +
        'symbolic endpoint alias, policyVersion) via the 137D resolver.',
    );
  }

  // Unconditional blockers — none of this exists in the repo yet.
  blockers.push(
    'Live Dataverse Custom API transport is not implemented (Phase 137E ships a fail-closed stub only).',
  );
  nextSteps.push(
    'Implement the server-bound transport behind the Dataverse Custom API and inject it explicitly.',
  );

  blockers.push(
    'Dataverse Custom API registration (cr664_RunLosCopilotAssist) is not verified.',
  );
  nextSteps.push(
    'Register / verify the cr664_RunLosCopilotAssist Custom API + plugin/Azure Function under the chosen solution publisher.',
  );

  blockers.push('Audit / event ledger logger is not wired.');
  nextSteps.push(
    'Wire per-call audit logging to a canonical ledger/event table (correlationId, redacted prompt/context, mode, proposals, errors).',
  );

  blockers.push('DLP and Azure OpenAI model policy are not approved.');
  nextSteps.push(
    'Obtain DLP approval for the Dataverse → Azure OpenAI egress and confirm the model/deployment policy.',
  );

  blockers.push(
    'Server-side secret store / managed identity is not configured.',
  );
  nextSteps.push(
    'Configure server-only secret management (prefer managed identity); the client never holds a secret.',
  );

  return {
    ready: blockers.length === 0,
    blockers,
    nextSteps,
  };
}
