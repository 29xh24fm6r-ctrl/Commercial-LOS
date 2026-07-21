import { useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  type CanonicalStageCode,
  type StageOrderingResult,
} from './stageOrderingContract';
import { evaluateExitGate, type StageGateFacts } from './stageGateContract';
import { deriveStageProgressionAvailability } from '../shared/governance/stageProgressionAvailability';
import type {
  CanonicalTransitionOutcome,
  CanonicalTransitionRequest,
  DealStatusCode,
  StageTransitionKind,
} from './canonicalStageTransition';

/**
 * Governance initiative (2026-07-21) — a fixed, non-invented set of adverse-action reason
 * categories for DECLINE. Replaces the prior behavior of stuffing raw free text into both
 * `code` and `detail` (a real gap the mapping research for this initiative identified) with a
 * genuine structured code, per `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` §3.3.
 * Deliberately generic — this is a starting, operator-editable set, not a claim of regulatory
 * completeness; an operator who needs a different/expanded set edits this one place.
 */
export const DECLINE_REASON_CODES = [
  { code: 'INSUFFICIENT_CASH_FLOW', label: 'Insufficient cash flow / repayment capacity' },
  { code: 'INSUFFICIENT_COLLATERAL', label: 'Insufficient collateral' },
  { code: 'CREDIT_HISTORY', label: 'Credit history / creditworthiness' },
  { code: 'LEVERAGE_CONCENTRATION', label: 'Excessive leverage / concentration' },
  { code: 'POLICY_EXCEPTION_DENIED', label: 'Requires a policy exception that was not granted' },
  { code: 'INCOMPLETE_APPLICATION', label: 'Incomplete application / unverifiable information' },
  { code: 'OTHER', label: 'Other (see detail)' },
] as const;

/**
 * Stage Advancement — the banker-facing workflow control (Phase 5).
 *
 * Renders where the deal is in the canonical pipeline, what the current stage's exit gate requires
 * (each requirement met / outstanding), and the four governed actions. This is the canonical-
 * pipeline counterpart to the internal-model AdvanceWorkflowStageButton (which stays bound to
 * LoanWorkflowState in the Loan Workflow Command Center).
 *
 * Disabled-safe by default:
 *   - ordering unavailable (stages unseeded) → a read-only availability banner, no actions;
 *   - not authorized → actions disabled;
 *   - exit gate unsatisfied → Advance disabled with the outstanding requirements shown;
 *   - `liveEnabled` false (default = AUTO_STAGE_ADVANCE_ENABLED) → actions PREVIEW the gate and
 *     report "not enabled in this environment", writing nothing (same pattern as New Deal create).
 */
export interface StageWorkflowControlProps {
  readonly ordering: StageOrderingResult;
  readonly currentStage?: CanonicalStageCode;
  readonly currentStatus: DealStatusCode;
  readonly gateFacts: StageGateFacts;
  readonly authorized: boolean;
  /** Whether a certified live transition transport is wired in this environment. Default: false. */
  readonly liveEnabled?: boolean;
  /**
   * Governed-action invoker. Only called when liveEnabled is true; otherwise the control previews.
   * MUST resolve to the real outcome (never a fabricated success) — the control awaits this and
   * renders exactly what it reports, including a server-side rejection's literal reason text, per
   * `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` and the certification's requirement
   * that a rejected write is never displayed as if it succeeded.
   */
  readonly onTransition?: (request: CanonicalTransitionRequest) => Promise<CanonicalTransitionOutcome>;
  /**
   * Governance initiative (2026-07-21) — the live banker workspace already mounts a separate,
   * shallow-requirement-engine ADVANCE control (`DealStageProgressionCard.tsx`, which does not use
   * `stageGateContract.ts`'s deep-fact gate this component's Advance button relies on). Mounting
   * both would show two Advance buttons that can legitimately disagree (the deep gate blocks on
   * untracked facts the shallow gate does not check yet) — genuinely confusing, not a bug in
   * either. Default true (a standalone mount, e.g. in tests/future full-cutover, gets all four
   * actions); the live deal workspace mount passes `false` so this component is the one place
   * RETURN/DECLINE/WITHDRAW live, without a second, disagreeing Advance control.
   */
  readonly showAdvance?: boolean;
}

const TERMINAL_STATUSES: ReadonlySet<DealStatusCode> = new Set(['DECLINED', 'WITHDRAWN', 'BOARDED']);
const PREVIEW_MESSAGE =
  'Stage advancement is not enabled in this environment yet — the action was previewed only and no change was made to the deal.';

function describeTransitionOutcome(outcome: CanonicalTransitionOutcome): string {
  switch (outcome.kind) {
    case 'transitioned':
      return outcome.to
        ? `${outcome.transition === 'RETURN' ? 'Returned' : 'Advanced'} to ${outcome.to}.`
        : `Deal ${outcome.status === 'DECLINED' ? 'declined' : outcome.status === 'WITHDRAWN' ? 'withdrawn' : 'updated'}.`;
    case 'disabled':
      return 'This action is not enabled in this environment yet; no change was made to the deal.';
    case 'unauthorized':
      return outcome.detail;
    case 'blocked':
      return `Blocked: ${outcome.reason}`;
    case 'dependency_not_ready':
      return outcome.detail;
    case 'update_failed':
      return `Update rejected: ${outcome.detail}`;
    case 'readback_failed':
      return `Change unconfirmed — persistence could not be verified: ${outcome.detail}`;
    case 'audit_failed_partial_success':
    case 'timeline_failed_partial_success':
      return outcome.detail;
    default:
      return 'The action did not complete.';
  }
}

export function StageWorkflowControl(props: StageWorkflowControlProps) {
  const { ordering, currentStage, currentStatus, gateFacts, authorized } = props;
  const liveEnabled = props.liveEnabled ?? false;
  const showAdvance = props.showAdvance ?? true;

  const [activeAction, setActiveAction] = useState<StageTransitionKind | null>(null);
  const [reason, setReason] = useState('');
  const [returnTarget, setReturnTarget] = useState<CanonicalStageCode | ''>('');
  const [declineCode, setDeclineCode] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<'success' | 'error' | 'preview' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 1. Unseeded / ambiguous ordering → honest read-only banner.
  if (ordering.status !== 'ready') {
    const availability = deriveStageProgressionAvailability(ordering);
    return (
      <section style={styles.wrap} aria-label="Stage workflow" data-stage-control data-stage-unavailable>
        <div style={styles.banner} role="status">
          <strong>{availability.banner}</strong>
          <p style={styles.bannerDetail}>{availability.detail}</p>
        </div>
      </section>
    );
  }

  const terminal = TERMINAL_STATUSES.has(currentStatus);
  const stage = currentStage ? ordering.stageByCode(currentStage) : undefined;
  const next = currentStage ? ordering.nextStage(currentStage) : undefined;
  const priors = currentStage ? ordering.priorStages(currentStage) : [];
  const gate = stage ? evaluateExitGate(stage.code, gateFacts) : undefined;

  const canAdvance = authorized && !terminal && !!next && !!gate && gate.satisfied;
  const canReturn = authorized && !terminal && priors.length > 0;
  const canDeclineOrWithdraw = authorized && !terminal;

  async function submit(kind: StageTransitionKind) {
    if (!currentStage) return;
    const request: CanonicalTransitionRequest = {
      kind,
      currentStage,
      currentStatus,
      targetStage: kind === 'RETURN' ? (returnTarget || undefined) : undefined,
      reason: kind === 'RETURN' || kind === 'WITHDRAW' ? reason : undefined,
      declineReason: kind === 'DECLINE' ? { code: declineCode, detail: reason || undefined } : undefined,
    };
    setActiveAction(null);
    setReason('');
    setReturnTarget('');
    setDeclineCode('');
    if (liveEnabled && props.onTransition) {
      setSubmitting(true);
      setMessage(null);
      setMessageKind(null);
      try {
        const outcome = await props.onTransition(request);
        setMessage(describeTransitionOutcome(outcome));
        setMessageKind(outcome.kind === 'transitioned' ? 'success' : 'error');
      } catch (err: unknown) {
        // A rejected write must never be reported as if it succeeded — including one that
        // throws instead of resolving to a typed outcome (e.g. a network/transport error).
        setMessage(`Update rejected: ${err instanceof Error ? err.message : String(err)}`);
        setMessageKind('error');
      } finally {
        setSubmitting(false);
      }
    } else {
      setMessage(PREVIEW_MESSAGE);
      setMessageKind('preview');
    }
  }

  return (
    <section style={styles.wrap} aria-label="Stage workflow" data-stage-control>
      <div style={styles.row}>
        <span style={styles.label}>Current stage</span>
        <span style={styles.value} data-current-stage>
          {stage ? `${stage.name} (sequence ${stage.sequence})` : 'Unknown stage'}
          {terminal ? ` — ${currentStatus}` : ''}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>Next stage</span>
        <span style={styles.value} data-next-stage>
          {terminal ? 'Terminal — no further stage' : next ? next.name : 'Terminal — no next stage'}
        </span>
      </div>

      {showAdvance && gate && !terminal && (
        <div style={styles.gate} data-exit-gate>
          <span style={styles.label}>Exit gate for {stage!.name}</span>
          <ul style={styles.checklist}>
            {gate.requirements.map((r) => (
              <li key={r.id} style={styles.checkItem} data-gate-requirement={r.id} data-met={r.met ? 'true' : 'false'}>
                <span aria-hidden style={{ color: r.met ? palette.clearFg : palette.textSubtle }}>
                  {r.met ? '✓' : '•'}
                </span>{' '}
                <span>{r.label}</span>
                <span style={styles.reqDetail}> — {r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!authorized && (
        <p style={styles.note} data-not-authorized>
          You are not authorized to change this deal's stage. Actions are read-only.
        </p>
      )}

      <div style={styles.actions}>
        {showAdvance && (
          <button type="button" style={btn(canAdvance && !submitting)} disabled={!canAdvance || submitting} onClick={() => submit('ADVANCE')} data-action="advance">
            Advance stage
          </button>
        )}
        <button type="button" style={btn(canReturn && !submitting)} disabled={!canReturn || submitting} onClick={() => setActiveAction('RETURN')} data-action="return">
          Return to earlier stage
        </button>
        <button type="button" style={btn(canDeclineOrWithdraw && !submitting)} disabled={!canDeclineOrWithdraw || submitting} onClick={() => setActiveAction('DECLINE')} data-action="decline">
          Decline
        </button>
        <button type="button" style={btn(canDeclineOrWithdraw && !submitting)} disabled={!canDeclineOrWithdraw || submitting} onClick={() => setActiveAction('WITHDRAW')} data-action="withdraw">
          Withdraw
        </button>
      </div>

      {activeAction === 'RETURN' && (
        <div style={styles.form} data-action-form="return">
          <label style={styles.label}>
            Return to
            <select value={returnTarget} onChange={(e) => setReturnTarget(e.target.value as CanonicalStageCode)} style={styles.input} aria-label="Return target stage">
              <option value="">Select an earlier stage…</option>
              {priors.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </label>
          <ReasonInput reason={reason} setReason={setReason} label="Reason for return" />
          <button type="button" style={btn(!!returnTarget && reason.trim().length > 0 && !submitting)} disabled={!returnTarget || reason.trim().length === 0 || submitting} onClick={() => submit('RETURN')}>
            Confirm return
          </button>
        </div>
      )}

      {activeAction === 'DECLINE' && (
        <div style={styles.form} data-action-form="decline">
          <label style={styles.label}>
            Decline reason
            <select value={declineCode} onChange={(e) => setDeclineCode(e.target.value)} style={styles.input} aria-label="Decline reason code">
              <option value="">Select a reason…</option>
              {DECLINE_REASON_CODES.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          </label>
          <ReasonInput reason={reason} setReason={setReason} label="Additional detail (optional)" />
          <p style={styles.note}>Decline records an adverse-action-pending marker. It does not send any borrower notification.</p>
          <button type="button" style={btn(declineCode.length > 0 && !submitting)} disabled={declineCode.length === 0 || submitting} onClick={() => submit('DECLINE')}>
            Confirm decline
          </button>
        </div>
      )}

      {activeAction === 'WITHDRAW' && (
        <div style={styles.form} data-action-form="withdraw">
          <ReasonInput reason={reason} setReason={setReason} label="Reason for withdrawal" />
          <button type="button" style={btn(reason.trim().length > 0 && !submitting)} disabled={reason.trim().length === 0 || submitting} onClick={() => submit('WITHDRAW')}>
            Confirm withdraw
          </button>
        </div>
      )}

      {submitting && <p style={styles.note} data-stage-submitting>Submitting…</p>}
      {message && (
        <p
          style={{ ...styles.note, color: messageKind === 'error' ? palette.blockedFg : messageKind === 'success' ? palette.clearFg : palette.textMuted }}
          data-stage-message
          data-stage-message-kind={messageKind ?? undefined}
          role={messageKind === 'error' ? 'alert' : undefined}
        >
          {message}
        </p>
      )}
    </section>
  );
}

function ReasonInput({ reason, setReason, label }: { reason: string; setReason: (v: string) => void; label: string }) {
  return (
    <label style={styles.label}>
      {label}
      <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={styles.input} aria-label={label} />
    </label>
  );
}

function btn(enabled: boolean): CSSProperties {
  return {
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    background: enabled ? palette.primary : palette.surfaceAlt,
    color: enabled ? palette.primaryFg : palette.textSubtle,
    padding: `${spacing.xs} ${spacing.sm}`,
    fontWeight: typography.weight.semibold,
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  row: { display: 'flex', gap: spacing.sm, alignItems: 'baseline' },
  label: { color: palette.textMuted, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  value: { color: palette.text, fontSize: typography.size.base },
  gate: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  checklist: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  checkItem: { fontSize: typography.size.sm, color: palette.text },
  reqDetail: { color: palette.textSubtle },
  actions: { display: 'flex', gap: spacing.sm, flexWrap: 'wrap' },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.xs, padding: spacing.sm, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.sm },
  input: { marginLeft: spacing.xs, padding: '2px 6px', border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm },
  note: { color: palette.textMuted, fontSize: typography.size.sm, margin: 0 },
  banner: { background: palette.surfaceAlt, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.sm, padding: spacing.sm },
  bannerDetail: { color: palette.textMuted, fontSize: typography.size.sm, margin: `${spacing.xs} 0 0` },
};
