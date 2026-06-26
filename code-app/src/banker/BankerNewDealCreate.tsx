import { useMemo, useState, type CSSProperties } from 'react';
import { useBanker } from './BankerContext';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  evaluateBankerCreateRollout,
  type BankerCreateRolloutState,
} from '../deals/bankerNewDealCreateRollout';
import {
  BANKER_CREATE_PILOT,
  bankerCreatePilotGateValues,
} from '../deals/bankerCreatePilotConfig';
import type { DealOriginationResult } from '../deals/dealOriginationOutcomes';

/**
 * Phase 182A -- Banker workspace New Deal create entry point.
 *
 * The single visible banker create surface. It reuses the governed
 * orchestrator + adapter (no forked create path): the live create runs only on
 * explicit submit, via a dynamic import so this component's static graph stays
 * SDK-free. Submit is reachable only when the banker rollout gate is
 * live_controlled (pilot enabled + resolved actor systemuser + banker
 * authorization). Public create stays disabled; downstream automations stay
 * disabled. Stage/Status resolve via the approved PRODUCTION resolver
 * (Intake / Open) -- never a GUID; the adapter fails closed if not Ready.
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; result: DealOriginationResult }
  | { kind: 'error'; message: string };

function gateMessage(state: BankerCreateRolloutState): string {
  switch (state) {
    case 'unauthorized':
      return 'You are not authorized to create deals (no Dataverse systemuser / banker rights). No record has been created.';
    case 'references_not_approved':
      return 'Production Stage/Status references are not approved. No record has been created.';
    case 'resolver_not_ready':
      return 'Stage/Status references are not ready. No record has been created.';
    case 'environment_not_allowed':
      return 'New Deal create is not approved for this environment. No record has been created.';
    case 'disabled':
    default:
      return 'New Deal creation is not enabled in this environment. No record has been created.';
  }
}

export function BankerNewDealCreate() {
  const { bankerId, systemUserId, writeDisabledReason, email } = useBanker();
  const [dealName, setDealName] = useState('');
  const [amount, setAmount] = useState('');
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  const bankerAuthorized = Boolean(systemUserId) && !writeDisabledReason;
  const rollout = useMemo<BankerCreateRolloutState>(
    () =>
      evaluateBankerCreateRollout({
        actorSystemUserId: systemUserId,
        bankerAuthorized,
        // Resolver readiness is verified at submit by the governed adapter,
        // which fails closed and surfaces resolver_not_ready honestly.
        resolverReady: true,
        productionReferencesApproved: BANKER_CREATE_PILOT.productionReferencesApproved,
        environmentIsProduction: BANKER_CREATE_PILOT.environmentIsProduction,
        productionRolloutApproved: BANKER_CREATE_PILOT.productionRolloutApproved,
        gateValues: bankerCreatePilotGateValues(),
      }),
    [systemUserId, bankerAuthorized],
  );
  const live = rollout === 'live_controlled';
  const canSubmit =
    live && dealName.trim().length > 0 && submit.kind !== 'submitting' && Boolean(systemUserId);

  async function onSubmit() {
    if (!canSubmit || !systemUserId) return;
    setSubmit({ kind: 'submitting' });
    try {
      const amt = amount.trim().length > 0 ? Number(amount) : undefined;
      const [orchestratorMod, adapter, reader] = await Promise.all([
        import('../deals/dealOriginationOrchestrator'),
        import('../deals/newDealCreateAdapter'),
        import('../deals/newDealReferenceReader'),
      ]);
      const result = await orchestratorMod.orchestrateDealOrigination(
        {
          form: {
            dealName: dealName.trim(),
            assignedBankerId: bankerId,
            actorSystemUserId: systemUserId,
            // Resolves the audit cr664_ChangedBy cr664_user bind (fail-closed).
            actorEmail: email,
            amount: amt,
          },
          // Downstream automations all disabled this pilot.
          config: {},
          context: { authorized: true, stageLabel: 'Intake', statusLabel: 'Open' },
        },
        {
          runGovernedCreate: async (form) => {
            const base = adapter.buildLiveNewDealCreateDeps();
            return adapter.createGovernedNewDeal(form, {
              ...base,
              enabled: true,
              // Approved PRODUCTION resolver (Intake / Open), TEST/PHASE filtered.
              resolveReferences: () => reader.resolveProductionNewDealReferences(),
            });
          },
        },
      );
      setSubmit({ kind: 'done', result });
    } catch (err) {
      setSubmit({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <section style={styles.wrap} aria-label="New Deal" data-banker-new-deal="panel">
      <header style={styles.head}>
        <div style={styles.titleRow}>
          <h3 style={styles.title}>New Deal</h3>
          <Badge variant={live ? 'clear' : 'neutral'} appearance="outline">
            {live ? 'Create enabled' : 'Create disabled'}
          </Badge>
        </div>
        <p style={styles.subtitle}>
          Create a governed loan deal. Stage opens at <strong>Intake</strong> with
          status <strong>Open</strong>. Audited; public + New Deal and downstream
          automation remain disabled.
        </p>
      </header>

      {!live ? (
        <div style={styles.note} role="note" data-banker-new-deal-state={rollout}>
          <strong>Create disabled:</strong> {gateMessage(rollout)}
        </div>
      ) : (
        <div style={styles.form} data-banker-new-deal-form>
          <label style={styles.label}>
            Deal name
            <input
              type="text"
              value={dealName}
              onChange={(e) => setDealName(e.target.value)}
              placeholder="e.g. Acme Working Capital"
              style={styles.input}
              data-banker-new-deal-name
              disabled={submit.kind === 'submitting'}
            />
          </label>
          <label style={styles.label}>
            Amount (optional)
            <input
              type="number"
              value={amount}
              min="0"
              onChange={(e) => setAmount(e.target.value)}
              style={styles.input}
              data-banker-new-deal-amount
              disabled={submit.kind === 'submitting'}
            />
          </label>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            style={canSubmit ? styles.action : styles.actionDisabled}
            data-banker-new-deal-submit
          >
            {submit.kind === 'submitting' ? 'Creating…' : 'Create deal'}
          </button>
        </div>
      )}

      <ResultBanner submit={submit} />
    </section>
  );
}

function ResultBanner({ submit }: { submit: SubmitState }) {
  if (submit.kind === 'idle' || submit.kind === 'submitting') return null;
  if (submit.kind === 'error') {
    return (
      <div style={styles.bannerError} role="alert" data-banker-new-deal-result="error">
        Create failed. No confirmed deal. {submit.message}
      </div>
    );
  }
  const r = submit.result;
  switch (r.kind) {
    case 'success_created_only':
    case 'success_created_with_automation':
      return (
        <div style={styles.bannerOk} role="status" data-banker-new-deal-result="success">
          ✓ Deal created. Id {r.createdDealId}. Stage {r.stageLabel} · Status {r.statusLabel}.{' '}
          It now appears in your Active Deals and Loan Workflow.{' '}
          <a href={`/deals/${r.createdDealId}`} style={styles.openDealLink} data-banker-new-deal-open>
            Open deal →
          </a>
        </div>
      );
    case 'audit_failed_partial':
      return (
        <div style={styles.bannerWarn} role="alert" data-banker-new-deal-result="audit_failed_partial">
          The deal was created (id {r.createdDealId}) but its audit record failed.
          An operator must reattempt the audit. This is not a clean success.
          {' '}Correlation id: {r.correlationId}.
          {r.auditOutcome?.error ? (
            <span data-banker-new-deal-audit-error> Audit error: {r.auditOutcome.error}</span>
          ) : null}
        </div>
      );
    case 'create_failed':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="create_failed">
          The deal could not be created. No record exists. {r.createOutcome.error ?? ''}
        </div>
      );
    case 'validation_error':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="validation_error">
          Please fix your input and try again. No record has been created.
        </div>
      );
    case 'unauthorized':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="unauthorized">
          You are not authorized to create deals. No record has been created.
        </div>
      );
    case 'resolver_not_ready':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="resolver_not_ready">
          Stage/Status references are not ready. No record has been created.
        </div>
      );
    default:
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="other">
          {r.userFacingMessage}
        </div>
      );
  }
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  titleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  note: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.sm, maxWidth: 420 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: typography.size.sm, color: palette.textMuted },
  input: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    fontFamily: typography.family,
  },
  action: {
    alignSelf: 'flex-start',
    background: palette.cobalt,
    color: palette.cobaltFg,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.lg}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    fontFamily: typography.family,
    cursor: 'pointer',
  },
  actionDisabled: {
    alignSelf: 'flex-start',
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.lg}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
  },
  bannerOk: {
    background: palette.clearBg,
    border: `1px solid ${palette.clear}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  openDealLink: {
    color: palette.cobalt,
    fontWeight: typography.weight.bold,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  bannerWarn: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  bannerError: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
};
