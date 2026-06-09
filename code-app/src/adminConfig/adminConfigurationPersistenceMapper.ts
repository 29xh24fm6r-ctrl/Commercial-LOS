/**
 * Phase 142J — Admin configuration persistence MAPPER.
 *
 * PURE. Maps Phase 142G proposals / review decisions / audit summaries to
 * Dataverse payload-shaped records. It REDACTS secrets / tokens / PII / SSN / TIN
 * / account numbers and reviewer notes, preserves proposalId / decisionId,
 * preserves `blocked_unsafe` and `approved_not_applied` (never applied), and
 * REJECTS executable payloads and any applied / deployed / published / activated
 * status. JSON serializes deterministically (sorted keys). No fake data, no IO.
 */

import type {
  AdminConfigurationProposal,
  AdminConfigurationReviewDecision,
  AdminConfigurationAuditSummary,
} from './adminConfigurationTypes';
import type {
  AdminConfigurationProposalRecord,
  AdminConfigurationReviewDecisionRecord,
  AdminConfigurationAuditRecord,
} from './adminConfigurationPersistenceTypes';
import { redactIfUnsafe, scanUnsafeContent } from './adminConfigurationContentSafety';

const FORBIDDEN_STATUS_RX = /\b(applied|deployed|published|activated|executed)\b/i;

/** Deterministic JSON — keys sorted recursively so persisted payloads are stable. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function assertNoForbiddenStatus(status: string): void {
  if (FORBIDDEN_STATUS_RX.test(status)) {
    throw new Error(`admin_config_apply_forbidden: cannot persist an applied/deployed/published/activated status ("${status}").`);
  }
}

function assertNoExecutablePayload(...texts: ReadonlyArray<string | undefined>): void {
  if (scanUnsafeContent(...texts).executable) {
    throw new Error('admin_config_validation_failed: executable payload cannot be persisted.');
  }
}

function safe(text: string): string {
  return redactIfUnsafe(text) ?? text;
}

function safeNullable(text: string | undefined): string | null {
  if (text === undefined) return null;
  return redactIfUnsafe(text) ?? null;
}

export function mapProposalToRecord(
  proposal: AdminConfigurationProposal,
  opts: { clock?: string } = {},
): AdminConfigurationProposalRecord {
  assertNoForbiddenStatus(proposal.status);
  assertNoExecutablePayload(proposal.title, proposal.summary, proposal.proposedChangeSummary, proposal.beforeSnapshot, proposal.afterSnapshot);
  const now = opts.clock ?? proposal.requestedAt;
  const validationStatus = proposal.status === 'blocked_unsafe' ? 'blocked' : proposal.status === 'approved_not_applied' ? 'approved_not_applied' : 'reviewable';
  return {
    cr664_name: `Admin config proposal ${proposal.proposalId}`,
    cr664_proposalidtext: proposal.proposalId,
    cr664_proposaltype: proposal.proposalType,
    cr664_title: safe(proposal.title),
    cr664_summary: safe(proposal.summary),
    cr664_requestedby: proposal.requestedBy,
    cr664_requestedat: proposal.requestedAt,
    cr664_targetdomain: proposal.targetDomain,
    cr664_targetkey: proposal.targetKey ?? null,
    cr664_riskclass: proposal.riskClass,
    cr664_status: proposal.status,
    cr664_validationstatus: validationStatus,
    cr664_blockersjson: stableStringify(proposal.blockers),
    cr664_warningsjson: stableStringify(proposal.warnings),
    cr664_impactsnapshotjson: stableStringify(proposal.impactSummary),
    cr664_redactedauditsummaryjson: stableStringify(proposal.auditSummary),
    cr664_createdat: now,
    cr664_updatedat: now,
  };
}

export function mapReviewDecisionToRecord(
  decision: AdminConfigurationReviewDecision,
): AdminConfigurationReviewDecisionRecord {
  assertNoForbiddenStatus(decision.resultingStatus);
  return {
    cr664_name: `Admin config decision ${decision.proposalId}/${decision.action}`,
    cr664_decisionidtext: `${decision.proposalId}:${decision.action}`,
    cr664_proposalidtext: decision.proposalId,
    cr664_decisiontype: decision.action,
    cr664_decisionstatus: decision.resultingStatus,
    cr664_reviewer: decision.decidedBy,
    cr664_reviewedat: decision.decidedAt,
    cr664_reviewernotesredacted: safeNullable(decision.reviewerNotesRedacted),
    cr664_blockersjson: stableStringify(decision.blockers),
    cr664_warningsjson: stableStringify(decision.warnings),
    cr664_redactedauditsummaryjson: stableStringify(decision.auditSummary),
  };
}

export interface MapAuditSummaryOptions {
  auditId: string;
  action: string;
  actor: string;
  timestamp: string;
  reason?: string;
}

export function mapAuditSummaryToRecord(
  proposalId: string,
  auditSummary: AdminConfigurationAuditSummary,
  opts: MapAuditSummaryOptions,
): AdminConfigurationAuditRecord {
  return {
    cr664_name: `Admin config audit ${opts.auditId}`,
    cr664_auditidtext: opts.auditId,
    cr664_proposalidtext: proposalId,
    cr664_action: opts.action,
    cr664_actor: opts.actor,
    cr664_timestamp: opts.timestamp,
    cr664_redactedsnapshotjson: stableStringify(auditSummary),
    cr664_reason: safeNullable(opts.reason),
    cr664_blockersjson: stableStringify([]),
    cr664_warningsjson: stableStringify([]),
  };
}
