/**
 * SPEC-COPILOT-LIVE-CONNECTOR-AND-SAFE-ACTION-ADAPTERS-1 — safe proposal engine.
 *
 * Pure. Given a read-only assist context, produce a list of PROPOSED
 * actions. Copilot can propose; it can NEVER execute. Every proposal:
 *   - has an action_type from the allowed enum (which structurally
 *     excludes any write/send/approve verb);
 *   - carries requires_confirmation: true;
 *   - carries a payload that only describes intent (anchors, draft
 *     seeds, suggestion text) — never a Dataverse patch, email, or
 *     stage transition.
 *
 * Disallowed in this phase (and not representable by the enum): create/
 * update Dataverse records, send email/Teams, advance stage, accept or
 * reject committee evidence, mark a task committee-grade, waive a risk
 * flag, approve credit, auto-regenerate memo, auto-run research.
 *
 * Mode gating:
 *   - live_read_only → navigation + suggestions only (open_screen,
 *     suggest_*). No draft_* staging.
 *   - proposal_only  → adds draft_* staging proposals (still confirmed,
 *     still no execution).
 */

import type { CopilotProposedAction } from './copilotConnector';
import type {
  CopilotDealAssistContext,
  CopilotWorkspaceAssistContext,
} from './copilotAssistContext';

export type ProposalMode = 'live_read_only' | 'proposal_only';

/** The only action types Copilot may ever propose. */
export const ALLOWED_PROPOSAL_ACTION_TYPES = [
  'open_screen',
  'draft_note',
  'draft_borrower_request',
  'draft_committee_task',
  'suggest_evidence',
  'suggest_research_rerun',
  'suggest_memo_regeneration',
] as const;

/** draft_* types are only offered in proposal_only mode. */
const DRAFT_ACTION_TYPES = new Set([
  'draft_note',
  'draft_borrower_request',
  'draft_committee_task',
]);

function action(
  partial: Omit<CopilotProposedAction, 'requires_confirmation'>,
): CopilotProposedAction {
  // requires_confirmation is hard-coded true on every proposal — there
  // is no code path that produces an unconfirmed action.
  return { ...partial, requires_confirmation: true };
}

/** Drop draft_* proposals when not in proposal_only mode. */
function gateByMode(
  proposals: CopilotProposedAction[],
  mode: ProposalMode,
): CopilotProposedAction[] {
  if (mode === 'proposal_only') return proposals;
  return proposals.filter((p) => !DRAFT_ACTION_TYPES.has(p.action_type));
}

// ---------------------------------------------------------------------------
// Deal-cockpit proposals
// ---------------------------------------------------------------------------

export function proposeDealActions(
  ctx: CopilotDealAssistContext,
  mode: ProposalMode,
): CopilotProposedAction[] {
  const out: CopilotProposedAction[] = [];

  // Always-safe navigation into the memo inputs.
  out.push(
    action({
      action_id: 'open-memo-inputs',
      action_type: 'open_screen',
      label: 'Open Memo Inputs',
      rationale: 'Review the structured inputs that feed the credit memo.',
      payload: { anchor: '#credit-memo' },
    }),
  );

  const bie = ctx.bie;
  if (bie) {
    out.push(
      action({
        action_id: 'open-committee-evidence',
        action_type: 'open_screen',
        label: 'Open Committee Evidence panel',
        rationale:
          'Inspect committee evidence tasks, statuses, and blockers.',
        payload: { anchor: '#committee-evidence' },
      }),
    );

    if (!bie.committeeEligible) {
      // Missing committee evidence → suggest collecting it (read-only
      // suggestion; Copilot never accepts evidence itself).
      for (const task of bie.evidenceTasks) {
        if (task.status === 'missing') {
          out.push(
            action({
              action_id: `suggest-evidence-${task.category}`,
              action_type: 'suggest_evidence',
              label: `Collect ${task.label} evidence`,
              rationale: `${task.label} is required for committee but is not yet captured.`,
              payload: { category: task.category, evidenceLabel: task.label },
            }),
          );
        } else if (task.status === 'accepted' && !task.committeeGrade) {
          out.push(
            action({
              action_id: `suggest-upgrade-${task.category}`,
              action_type: 'suggest_evidence',
              label: `Upgrade ${task.label} to committee-grade evidence`,
              rationale: `${task.label} is accepted but does not yet meet committee grade.`,
              payload: { category: task.category, evidenceLabel: task.label },
            }),
          );
        } else if (
          task.status === 'accepted' &&
          task.committeeGrade &&
          task.autoClearable === false
        ) {
          // Accepted, committee-grade, but still needs a human judgement
          // step (e.g. scale plausibility). Suggest an analyst note in
          // proposal_only; otherwise surface as evidence suggestion.
          out.push(
            action({
              action_id: `resolve-${task.category}`,
              action_type: 'draft_note',
              label: `Draft analyst note to resolve ${task.label}`,
              rationale: `${task.label} is accepted but not auto-clearable; an analyst note/evidence is needed to resolve it.`,
              payload: { category: task.category, evidenceLabel: task.label },
            }),
          );
        }
      }

      // Borrower-provided evidence requests are a staging draft.
      out.push(
        action({
          action_id: 'draft-borrower-evidence-request',
          action_type: 'draft_borrower_request',
          label: 'Draft borrower evidence request',
          rationale:
            'Stage a borrower request for the outstanding committee evidence (requires your confirmation to send later).',
          payload: { scope: 'committee-evidence' },
        }),
      );
    }

    // Research grade present → suggest a re-run (never auto-runs).
    if (bie.researchGrade && bie.researchGrade !== 'committee') {
      out.push(
        action({
          action_id: 'suggest-research-rerun',
          action_type: 'suggest_research_rerun',
          label: 'Suggest re-run research',
          rationale: `Current research grade is "${bie.researchGrade}"; a committee-grade re-run may be warranted.`,
          payload: { currentGrade: bie.researchGrade },
        }),
      );
    }

    if (bie.sourceSnapshotStatus && bie.sourceSnapshotStatus !== 'complete') {
      out.push(
        action({
          action_id: 'suggest-source-snapshot',
          action_type: 'suggest_evidence',
          label: 'Suggest source snapshot collection',
          rationale:
            'Source snapshots are incomplete; capturing them strengthens committee evidence.',
          payload: { sourceSnapshotStatus: bie.sourceSnapshotStatus },
        }),
      );
    }
  }

  // Readiness blockers → suggest a memo regeneration (suggestion only).
  if (ctx.readinessBlockers.length > 0) {
    out.push(
      action({
        action_id: 'suggest-memo-regeneration',
        action_type: 'suggest_memo_regeneration',
        label: 'Suggest regenerate memo',
        rationale:
          'Readiness inputs changed; regenerating the memo may be appropriate (you decide and trigger it).',
        payload: { blockerCount: ctx.readinessBlockers.length },
      }),
    );
  }

  // A staged banker note is always a safe proposal_only option.
  out.push(
    action({
      action_id: 'draft-banker-note',
      action_type: 'draft_note',
      label: 'Draft banker note',
      rationale: 'Stage a note summarizing the current state for your review.',
      payload: { scope: 'deal' },
    }),
  );

  return gateByMode(out, mode);
}

// ---------------------------------------------------------------------------
// Command-center proposals
// ---------------------------------------------------------------------------

export function proposeWorkspaceActions(
  ctx: CopilotWorkspaceAssistContext,
  mode: ProposalMode,
): CopilotProposedAction[] {
  const out: CopilotProposedAction[] = [];

  out.push(
    action({
      action_id: 'open-exceptions',
      action_type: 'open_screen',
      label: 'Open exceptions',
      rationale: 'Review the blocked / at-risk exception items.',
      payload: { role: ctx.workspace.workspaceRole },
    }),
  );

  if (ctx.topBlockers.length > 0) {
    out.push(
      action({
        action_id: 'draft-workspace-note',
        action_type: 'draft_note',
        label: 'Draft summary note',
        rationale: 'Stage a note summarizing the top blockers for your team.',
        payload: { blockerCount: ctx.topBlockers.length },
      }),
    );
  }

  return gateByMode(out, mode);
}
