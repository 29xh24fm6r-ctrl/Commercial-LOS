import { useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  type CanonicalStageCode,
  type StageOrderingResult,
} from './stageOrderingContract';
import { evaluateExitGate, type StageGateFacts } from './stageGateContract';
import { deriveStageProgressionAvailability } from '../shared/governance/stageProgressionAvailability';
import type {
  CanonicalTransitionRequest,
  DealStatusCode,
  StageTransitionKind,
} from './canonicalStageTransition';

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
  /** Governed-action invoker. Only called when liveEnabled is true; otherwise the control previews. */
  readonly onTransition?: (request: CanonicalTransitionRequest) => void;
}

const TERMINAL_STATUSES: ReadonlySet<DealStatusCode> = new Set(['DECLINED', 'WITHDRAWN', 'BOARDED']);
const PREVIEW_MESSAGE =
  'Stage advancement is not enabled in this environment yet — the action was previewed only and no change was made to the deal.';

export function StageWorkflowControl(props: StageWorkflowControlProps) {
  const { ordering, currentStage, currentStatus, gateFacts, authorized } = props;
  const liveEnabled = props.liveEnabled ?? false;

  const [activeAction, setActiveAction] = useState<StageTransitionKind | null>(null);
  const [reason, setReason] = useState('');
  const [returnTarget, setReturnTarget] = useState<CanonicalStageCode | ''>('');
  const [message, setMessage] = useState<string | null>(null);

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

  function submit(kind: StageTransitionKind) {
    if (!currentStage) return;
    const request: CanonicalTransitionRequest = {
      kind,
      currentStage,
      currentStatus,
      targetStage: kind === 'RETURN' ? (returnTarget || undefined) : undefined,
      reason: kind === 'RETURN' || kind === 'WITHDRAW' ? reason : undefined,
      declineReason: kind === 'DECLINE' ? { code: reason || 'UNSPECIFIED', detail: reason } : undefined,
    };
    if (liveEnabled && props.onTransition) {
      props.onTransition(request);
      setMessage(null);
    } else {
      setMessage(PREVIEW_MESSAGE);
    }
    setActiveAction(null);
    setReason('');
    setReturnTarget('');
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

      {gate && !terminal && (
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
        <button type="button" style={btn(canAdvance)} disabled={!canAdvance} onClick={() => submit('ADVANCE')} data-action="advance">
          Advance stage
        </button>
        <button type="button" style={btn(canReturn)} disabled={!canReturn} onClick={() => setActiveAction('RETURN')} data-action="return">
          Return to earlier stage
        </button>
        <button type="button" style={btn(canDeclineOrWithdraw)} disabled={!canDeclineOrWithdraw} onClick={() => setActiveAction('DECLINE')} data-action="decline">
          Decline
        </button>
        <button type="button" style={btn(canDeclineOrWithdraw)} disabled={!canDeclineOrWithdraw} onClick={() => setActiveAction('WITHDRAW')} data-action="withdraw">
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
          <button type="button" style={btn(!!returnTarget && reason.trim().length > 0)} disabled={!returnTarget || reason.trim().length === 0} onClick={() => submit('RETURN')}>
            Confirm return
          </button>
        </div>
      )}

      {activeAction === 'DECLINE' && (
        <div style={styles.form} data-action-form="decline">
          <ReasonInput reason={reason} setReason={setReason} label="Structured decline reason" />
          <p style={styles.note}>Decline records an adverse-action-pending marker. It does not send any borrower notification.</p>
          <button type="button" style={btn(reason.trim().length > 0)} disabled={reason.trim().length === 0} onClick={() => submit('DECLINE')}>
            Confirm decline
          </button>
        </div>
      )}

      {activeAction === 'WITHDRAW' && (
        <div style={styles.form} data-action-form="withdraw">
          <ReasonInput reason={reason} setReason={setReason} label="Reason for withdrawal" />
          <button type="button" style={btn(reason.trim().length > 0)} disabled={reason.trim().length === 0} onClick={() => submit('WITHDRAW')}>
            Confirm withdraw
          </button>
        </div>
      )}

      {message && <p style={styles.note} data-stage-message>{message}</p>}
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
