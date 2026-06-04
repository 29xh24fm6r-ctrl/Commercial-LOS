/**
 * SPEC-COPILOT-LIVE-CONNECTOR-AND-SAFE-ACTION-ADAPTERS-1 — governed connector.
 *
 * Extends the Phase 129A Copilot boundary into an explicit-mode, governed
 * live-assistant FOUNDATION:
 *
 *   not_configured  — default. No connector. Local read-only summaries
 *                     only (current posture). isLive=false. No proposals.
 *   live_read_only  — live summaries + recommendations + risks, plus
 *                     navigation/suggestion proposals. No drafts. No writes.
 *   proposal_only   — adds draft_* staging proposals (still confirmed,
 *                     still no execution). No writes.
 *   disabled        — explicitly turned off; honest "disabled" response.
 *
 * Safety invariants enforced here:
 *   - No client-side secrets. The Azure OpenAI key / endpoint are
 *     SERVER-ONLY; this module never reads them. The client only reads
 *     the non-secret VITE_COPILOT_MODE / VITE_COPILOT_PROVIDER flags.
 *   - Live model calls are server-only, behind the CopilotLiveTransport
 *     boundary, which is NOT wired in this phase. Without an injected
 *     transport, azure_openai / copilot_studio resolve to `disabled`.
 *   - No fetch / network call in this module. The `mock` provider
 *     produces deterministic grounded output locally for tests/demo.
 *   - resolveCopilotConnectorStatus never throws.
 *   - Copilot can summarize and propose; it can never write, send, or
 *     approve. Proposals come from the safe proposal engine and always
 *     require confirmation.
 */

import {
  proposeDealActions,
  proposeWorkspaceActions,
} from './copilotProposalEngine';
import type {
  CopilotDealAssistContext,
  CopilotWorkspaceAssistContext,
} from './copilotAssistContext';

// ---------------------------------------------------------------------------
// Types (per spec)
// ---------------------------------------------------------------------------

export type CopilotConnectorMode =
  | 'not_configured'
  | 'live_read_only'
  | 'proposal_only'
  | 'disabled';

export type CopilotProvider =
  | 'default'
  | 'azure_openai'
  | 'copilot_studio'
  | 'mock';

export interface CopilotConnectorStatus {
  mode: CopilotConnectorMode;
  provider: CopilotProvider;
  connected: boolean;
  reason?: string;
  model?: string;
  last_checked_at?: string;
}

export type CopilotProposedActionType =
  | 'open_screen'
  | 'draft_note'
  | 'draft_borrower_request'
  | 'draft_committee_task'
  | 'suggest_evidence'
  | 'suggest_research_rerun'
  | 'suggest_memo_regeneration';

export interface CopilotProposedAction {
  action_id: string;
  action_type: CopilotProposedActionType;
  label: string;
  rationale: string;
  /** Always true. Copilot proposes; the human confirms and acts. */
  requires_confirmation: true;
  payload: Record<string, unknown>;
}

export interface CopilotConnectorResponse {
  isLive: boolean;
  mode: string;
  summary: string;
  recommendations: string[];
  risks: string[];
  proposed_actions: CopilotProposedAction[];
  citations_or_evidence_refs: string[];
  limitations: string[];
}

/**
 * SERVER-ONLY live-call boundary. A real implementation lives behind a
 * Dataverse custom API / connector (see PHASE_130B). It is intentionally
 * NOT implemented client-side, so no secret or fetch ships in the bundle.
 */
export interface CopilotLiveTransport {
  readonly providerLabel: string;
  readonly model?: string;
}

export interface CopilotConnector {
  status(): CopilotConnectorStatus;
  assistDeal(ctx: CopilotDealAssistContext): CopilotConnectorResponse;
  assistWorkspace(ctx: CopilotWorkspaceAssistContext): CopilotConnectorResponse;
}

// ---------------------------------------------------------------------------
// Env resolution
// ---------------------------------------------------------------------------

/** Non-secret, client-visible Copilot configuration. */
export interface CopilotEnv {
  mode?: string;
  provider?: string;
}

const VALID_MODES = new Set<CopilotConnectorMode>([
  'not_configured',
  'live_read_only',
  'proposal_only',
  'disabled',
]);

const VALID_PROVIDERS = new Set<CopilotProvider>([
  'default',
  'azure_openai',
  'copilot_studio',
  'mock',
]);

function normalizeProvider(raw: string | undefined): CopilotProvider {
  const p = (raw ?? 'default').trim();
  return VALID_PROVIDERS.has(p as CopilotProvider)
    ? (p as CopilotProvider)
    : 'default';
}

/**
 * Pure status resolution. Never throws; never reads a secret.
 *   - missing mode → not_configured
 *   - unrecognized mode → not_configured (with reason)
 *   - live modes need a usable provider:
 *       mock → connected (deterministic local)
 *       azure_openai / copilot_studio → require an injected server-side
 *         transport (not wired this phase) → disabled with reason
 *       default / missing → not_configured with reason
 */
export function resolveCopilotConnectorStatus(
  env: CopilotEnv = {},
  opts: { transport?: CopilotLiveTransport } = {},
): CopilotConnectorStatus {
  try {
    const rawMode = (env.mode ?? '').trim();
    const provider = normalizeProvider(env.provider);

    if (rawMode.length === 0) {
      return {
        mode: 'not_configured',
        provider,
        connected: false,
        reason: 'COPILOT_MODE is not set.',
      };
    }

    if (!VALID_MODES.has(rawMode as CopilotConnectorMode)) {
      return {
        mode: 'not_configured',
        provider,
        connected: false,
        reason: `Unrecognized COPILOT_MODE "${rawMode}".`,
      };
    }

    const mode = rawMode as CopilotConnectorMode;

    if (mode === 'disabled') {
      return {
        mode: 'disabled',
        provider,
        connected: false,
        reason: 'Copilot is disabled by configuration.',
      };
    }

    if (mode === 'not_configured') {
      return { mode: 'not_configured', provider, connected: false };
    }

    // mode is live_read_only or proposal_only.
    if (provider === 'mock') {
      return { mode, provider, connected: true, model: 'mock' };
    }

    if (provider === 'azure_openai' || provider === 'copilot_studio') {
      if (opts.transport) {
        return {
          mode,
          provider,
          connected: true,
          model: opts.transport.model,
        };
      }
      const label =
        provider === 'azure_openai' ? 'Azure OpenAI' : 'Copilot Studio';
      return {
        mode: 'disabled',
        provider,
        connected: false,
        reason: `${label} live transport is not wired (server-only live calls required).`,
      };
    }

    // Live mode requested but provider is default/unknown.
    return {
      mode: 'not_configured',
      provider,
      connected: false,
      reason: 'No Copilot provider is configured for live mode.',
    };
  } catch {
    return {
      mode: 'not_configured',
      provider: 'default',
      connected: false,
      reason: 'Copilot status resolution failed; defaulting to not_configured.',
    };
  }
}

// ---------------------------------------------------------------------------
// Deterministic summarizers (also used by the `mock` provider)
// ---------------------------------------------------------------------------

interface SummaryParts {
  summary: string;
  recommendations: string[];
  risks: string[];
  citations: string[];
  limitations: string[];
}

const NOT_CONFIGURED_LIMITATION =
  'Copilot connector not configured. Local summaries only. No AI. No external calls.';
const NOT_LIVE_LIMITATION =
  'Generated locally from data already on your screen. Not AI-generated. Not a recommendation to act.';
const LIVE_LIMITATION =
  'Copilot can summarize and suggest. It cannot write or submit changes. Verify before acting.';

function summarizeDealParts(
  ctx: CopilotDealAssistContext,
  isLive: boolean,
): SummaryParts {
  const d = ctx.deal;
  const lines: string[] = [];
  if (d.dealName) lines.push(`Deal: ${d.dealName}`);
  if (d.clientName) lines.push(`Client: ${d.clientName}`);
  if (d.stage) lines.push(`Stage: ${d.stage}`);
  if (d.status) lines.push(`Status: ${d.status}`);
  lines.push(
    `Work: ${d.openTaskCount} open task(s), ${d.outstandingDocumentCount} outstanding document(s).`,
  );

  const recommendations: string[] = [];
  const risks: string[] = [];
  const citations = ['deal'];

  for (const flag of ctx.riskFlags) risks.push(flag);
  for (const b of ctx.readinessBlockers) risks.push(b);

  const bie = ctx.bie;
  if (bie) {
    citations.push('committee-evidence');
    lines.push(
      bie.preliminaryEligible
        ? 'Preliminary eligibility is clear.'
        : 'Preliminary eligibility is NOT yet clear.',
    );
    lines.push(
      bie.committeeEligible
        ? 'Committee eligibility is clear.'
        : 'Committee eligibility remains blocked.',
    );
    lines.push(`${bie.evidenceTaskCount} committee evidence task(s).`);

    const committeeGradeAccepted = bie.evidenceTasks.filter(
      (t) => t.status === 'accepted' && t.committeeGrade,
    );
    const acceptedNotCommittee = bie.evidenceTasks.filter(
      (t) => t.status === 'accepted' && !t.committeeGrade,
    );
    const missing = bie.evidenceTasks.filter((t) => t.status === 'missing');
    const acceptedNotAutoClearable = bie.evidenceTasks.filter(
      (t) =>
        t.status === 'accepted' &&
        t.committeeGrade &&
        t.autoClearable === false,
    );

    for (const t of committeeGradeAccepted) {
      lines.push(`${t.label} accepted at committee grade.`);
    }
    for (const t of acceptedNotCommittee) {
      lines.push(`${t.label} accepted but not committee-grade.`);
    }
    if (missing.length > 0) {
      lines.push(`Missing: ${missing.map((t) => t.label).join(', ')}.`);
    }
    for (const t of acceptedNotAutoClearable) {
      lines.push(`${t.label} accepted but not auto-clearable.`);
    }

    if (!bie.committeeEligible) {
      for (const t of missing) {
        recommendations.push(`Collect ${t.label} evidence.`);
      }
      for (const t of acceptedNotCommittee) {
        recommendations.push(`Upgrade ${t.label} to committee grade.`);
      }
      for (const t of acceptedNotAutoClearable) {
        recommendations.push(
          `Resolve ${t.label} with an analyst note or supporting evidence.`,
        );
      }
      risks.push('Committee remains blocked until evidence is resolved.');
    }
    if (bie.committeeBlockerCategories.length > 0) {
      lines.push(
        `Top remaining blocker categories: ${bie.committeeBlockerCategories.join(', ')}.`,
      );
    }
  } else if (ctx.nextBestAction) {
    recommendations.push(ctx.nextBestAction);
  }

  return {
    summary: lines.join('\n'),
    recommendations,
    risks,
    citations,
    limitations: [isLive ? LIVE_LIMITATION : NOT_LIVE_LIMITATION],
  };
}

function summarizeWorkspaceParts(
  ctx: CopilotWorkspaceAssistContext,
  isLive: boolean,
): SummaryParts {
  const w = ctx.workspace;
  const lines: string[] = [`Workspace: ${w.workspaceRole}`];
  if (w.teamName) lines.push(`Team: ${w.teamName}`);
  lines.push(`Deals: ${w.dealCount}`);
  if (w.urgentItemCount > 0) lines.push(`Urgent items: ${w.urgentItemCount}`);
  for (const k of w.kpiSummaries) lines.push(k);

  const risks = [...ctx.topBlockers];
  const recommendations: string[] = [];
  if (ctx.topBlockers.length > 0) {
    recommendations.push('Review the top blockers and triage exceptions.');
  }

  return {
    summary: lines.join('\n'),
    recommendations,
    risks,
    citations: ['workspace'],
    limitations: [isLive ? LIVE_LIMITATION : NOT_LIVE_LIMITATION],
  };
}

// ---------------------------------------------------------------------------
// Connector factory
// ---------------------------------------------------------------------------

function isProposalMode(
  mode: CopilotConnectorMode,
): mode is 'live_read_only' | 'proposal_only' {
  return mode === 'live_read_only' || mode === 'proposal_only';
}

function disabledResponse(status: CopilotConnectorStatus): CopilotConnectorResponse {
  return {
    isLive: false,
    mode: status.mode,
    summary:
      status.mode === 'disabled'
        ? `Copilot is disabled. ${status.reason ?? ''}`.trim()
        : `Copilot connector is not configured. ${status.reason ?? ''}`.trim(),
    recommendations: [],
    risks: [],
    proposed_actions: [],
    citations_or_evidence_refs: [],
    limitations: [
      'Copilot connector not configured. Local summaries only. No AI. No external calls.',
    ],
  };
}

export function createCopilotConnector(
  status: CopilotConnectorStatus,
): CopilotConnector {
  const frozen: CopilotConnectorStatus = Object.freeze({ ...status });

  function live(): boolean {
    return frozen.connected && isProposalMode(frozen.mode);
  }

  return {
    status() {
      return frozen;
    },
    assistDeal(ctx) {
      if (!isProposalMode(frozen.mode) && frozen.mode !== 'not_configured') {
        return disabledResponse(frozen);
      }
      if (frozen.mode === 'not_configured') {
        // Honest local summary, no proposals (preserves inert posture).
        const parts = summarizeDealParts(ctx, false);
        return {
          isLive: false,
          mode: frozen.mode,
          summary: parts.summary,
          recommendations: parts.recommendations,
          risks: parts.risks,
          proposed_actions: [],
          citations_or_evidence_refs: parts.citations,
          limitations: [NOT_CONFIGURED_LIMITATION, ...parts.limitations],
        };
      }
      const isLive = live();
      const parts = summarizeDealParts(ctx, isLive);
      const proposals = isLive
        ? proposeDealActions(ctx, frozen.mode as 'live_read_only' | 'proposal_only')
        : [];
      return {
        isLive,
        mode: frozen.mode,
        summary: parts.summary,
        recommendations: parts.recommendations,
        risks: parts.risks,
        proposed_actions: proposals,
        citations_or_evidence_refs: parts.citations,
        limitations: parts.limitations,
      };
    },
    assistWorkspace(ctx) {
      if (!isProposalMode(frozen.mode) && frozen.mode !== 'not_configured') {
        return disabledResponse(frozen);
      }
      if (frozen.mode === 'not_configured') {
        const parts = summarizeWorkspaceParts(ctx, false);
        return {
          isLive: false,
          mode: frozen.mode,
          summary: parts.summary,
          recommendations: parts.recommendations,
          risks: parts.risks,
          proposed_actions: [],
          citations_or_evidence_refs: parts.citations,
          limitations: [NOT_CONFIGURED_LIMITATION, ...parts.limitations],
        };
      }
      const isLive = live();
      const parts = summarizeWorkspaceParts(ctx, isLive);
      const proposals = isLive
        ? proposeWorkspaceActions(
            ctx,
            frozen.mode as 'live_read_only' | 'proposal_only',
          )
        : [];
      return {
        isLive,
        mode: frozen.mode,
        summary: parts.summary,
        recommendations: parts.recommendations,
        risks: parts.risks,
        proposed_actions: proposals,
        citations_or_evidence_refs: parts.citations,
        limitations: parts.limitations,
      };
    },
  };
}

export function createNotConfiguredConnector(): CopilotConnector {
  return createCopilotConnector(
    resolveCopilotConnectorStatus({}, {}),
  );
}

/**
 * Test/demo helper — a connected `mock` connector in the given live mode.
 * Produces deterministic grounded output without any external call.
 */
export function createMockConnector(
  mode: 'live_read_only' | 'proposal_only',
): CopilotConnector {
  return createCopilotConnector(
    resolveCopilotConnectorStatus({ mode, provider: 'mock' }, {}),
  );
}

// ---------------------------------------------------------------------------
// Env-backed singleton
// ---------------------------------------------------------------------------

function readCopilotEnv(): CopilotEnv {
  // Vite exposes only VITE_-prefixed, non-secret vars to the client.
  // The Azure OpenAI endpoint / deployment / key are server-only and are
  // NEVER read here, so no secret can reach the bundle.
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })
      .env;
    return {
      mode: env?.VITE_COPILOT_MODE,
      provider: env?.VITE_COPILOT_PROVIDER,
    };
  } catch {
    return {};
  }
}

let _connector: CopilotConnector = createCopilotConnector(
  resolveCopilotConnectorStatus(readCopilotEnv(), {}),
);

export function getCopilotConnector(): CopilotConnector {
  return _connector;
}

/** Test-only: swap the connector. Production code must not call this. */
export function _setCopilotConnectorForTest(connector: CopilotConnector): void {
  _connector = connector;
}

/** Test-only: reset to the env-resolved default. */
export function _resetCopilotConnectorForTest(): void {
  _connector = createCopilotConnector(
    resolveCopilotConnectorStatus(readCopilotEnv(), {}),
  );
}
