import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { createDataverseCreditApprovalDecisionStore } from '../creditApproval/creditApprovalDecisionStore';
import { submitCreditApprovalDecision } from '../creditApproval/submitCreditApprovalDecision';
import type { CreditApprovalDecisionRecord, CreditApprovalDecisionStatus } from '../workflow/creditApprovalDecisionTypes';
import type { BankerCreditAuthority } from '../workflow/creditApprovalAuthority';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * Final LOS Completion arc — Workstream C. Mounts the durable Credit Approval Decision record
 * (submitCreditApprovalDecision.ts / creditApprovalDecisionStore.ts) into the Deal Workspace,
 * alongside the existing read-only CreditApprovalReadinessPanel. Proves the full loop this arc
 * requires: user action -> authorized write -> durable record -> reload -> exact-record readback
 * (listDecisionsForDeal on mount) -> downstream consumption (this same list is what a future
 * COMMITMENT-stage gate or FINAL_WORKFLOW_REQUIREMENT_MATRIX check would read).
 *
 * Same disclosed caveat as every other new-entity adapter this arc adds: the backing table has not
 * been applied to any live Dataverse environment yet (see creditApprovalDecisionStore.ts's header),
 * so every live call here fails closed with a visible error until an operator applies the migration
 * in scripts/schema-migrations/final-arc-credit-approval-decision/.
 */

const DECISION_STATUS_OPTIONS: readonly CreditApprovalDecisionStatus[] = [
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'DECLINED',
  'RETURNED',
];

export function DealCreditApprovalDecisionPanel({
  dealId,
  dealAmount,
  authorized,
  actorEmail,
  systemUserId,
  bankerId,
  creditAuthority,
  assignedBankerId,
  onDecisionSubmitted,
}: {
  dealId: string;
  dealAmount: number | undefined;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
  bankerId: string | undefined;
  creditAuthority: BankerCreditAuthority | undefined;
  assignedBankerId: string | undefined;
  /** Notifies a DealDataProvider-aware wrapper so `creditApprovalDecisions` context and the
   *  activity timeline reload — see `DealFundingAuthorizationPanelConnected.tsx` for the precedent. */
  onDecisionSubmitted?: () => void;
}) {
  const storeRef = useRef(createDataverseCreditApprovalDecisionStore());
  // Lifecycle guard for load()'s async work (mount effect + every post-submit reload). Prevents any
  // state update — success or failure path — after this panel has unmounted (e.g. the deal
  // workspace navigates away, or a test unmounts) while listDecisionsForDeal is still in flight.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [decisions, setDecisions] = useState<readonly CreditApprovalDecisionRecord[]>([]);
  const [decisionStatus, setDecisionStatus] = useState<CreditApprovalDecisionStatus>('APPROVED');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [approvedProduct, setApprovedProduct] = useState('');
  const [approvedTermMonths, setApprovedTermMonths] = useState('');
  const [approvedPricing, setApprovedPricing] = useState('');
  const [collateralSummary, setCollateralSummary] = useState('');
  const [conditionsText, setConditionsText] = useState('');
  const [rationale, setRationale] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const email = actorEmail ?? '';

  function load() {
    setLoadState('loading');
    setLoadError(undefined);
    storeRef.current
      .listDecisionsForDeal(dealId)
      .then((res) => {
        if (!isMountedRef.current) return;
        if (res.success) {
          setDecisions(res.decisions ?? []);
          setLoadState('ready');
        } else {
          setLoadState('error');
          setLoadError(res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load credit approval decisions.');
        }
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current) return;
        setLoadState('error');
        const raw = err instanceof Error ? err.message : String(err);
        setLoadError(mapBusinessSafeError(raw).safeMessage);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(undefined);
    const conditions = conditionsText
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const outcome = await submitCreditApprovalDecision(
      {
        dealId,
        decisionStatus,
        approvedAmount: approvedAmount.trim() ? Number(approvedAmount) : undefined,
        approvedProduct: approvedProduct.trim() || undefined,
        approvedTermMonths: approvedTermMonths.trim() ? Number(approvedTermMonths) : undefined,
        approvedPricing: approvedPricing.trim() || undefined,
        collateralSummary: collateralSummary.trim() || undefined,
        conditions,
        rationale,
        requestedByActorEmail: email,
        actorEmail: email,
        systemUserId: systemUserId ?? '',
        actorResolved: Boolean(systemUserId),
        banker: creditAuthority,
        dealAmount,
        requestProfileAmount: undefined,
        advancingActorBankerId: bankerId,
        originatingBankerId: assignedBankerId,
      },
      storeRef.current,
    );
    if (outcome.kind === 'success') {
      setRationale('');
      setConditionsText('');
      setApprovedAmount('');
      setApprovedProduct('');
      setApprovedTermMonths('');
      setApprovedPricing('');
      setCollateralSummary('');
      load();
      onDecisionSubmitted?.();
    } else if (outcome.kind === 'governance-partial') {
      load();
      onDecisionSubmitted?.();
      setSubmitError(
        [outcome.auditError, outcome.timelineError].filter(Boolean).join(' '),
      );
    } else if (outcome.kind === 'invalid-input') {
      setSubmitError(outcome.message);
    } else if (outcome.kind === 'authority-denied') {
      setSubmitError(outcome.message);
    } else {
      setSubmitError(outcome.error);
    }
  }

  return (
    <Card>
      <CardHeader title="Credit Approval Decision" subtitle="Durable approval/decline record — amount, terms, conditions, authority, rationale." />
      {loadState === 'loading' && (
        <p style={styles.note} role="status" data-credit-approval-decision-loading>
          Loading credit approval decisions…
        </p>
      )}
      {loadState === 'error' && (
        <p style={styles.error} role="alert" data-credit-approval-decision-load-error>
          Could not load credit approval decisions: {loadError}
        </p>
      )}
      {loadState === 'ready' && (
        <>
          {decisions.length === 0 ? (
            <p style={styles.note}>No credit approval decision recorded yet for this deal.</p>
          ) : (
            <ul style={styles.list} data-credit-approval-decision-list>
              {decisions.map((d) => (
                <li key={d.decisionId} style={styles.listItem}>
                  <Badge variant={d.status === 'DECLINED' ? 'blocked' : d.status === 'RETURNED' ? 'neutral' : 'clear'}>
                    {d.status}
                  </Badge>{' '}
                  {d.approvedAmount !== undefined && <strong>${d.approvedAmount.toLocaleString()}</strong>}{' '}
                  {d.authorityTier && <span style={styles.muted}>({d.authorityTier} authority)</span>}
                  <p style={styles.rationale}>{d.rationale}</p>
                </li>
              ))}
            </ul>
          )}
          <form style={styles.form} onSubmit={onSubmit} data-credit-approval-decision-form>
            <label style={styles.label} htmlFor="cad-status">Decision</label>
            <select
              id="cad-status"
              style={styles.input}
              value={decisionStatus}
              onChange={(e) => setDecisionStatus(e.target.value as CreditApprovalDecisionStatus)}
              disabled={!authorized}
            >
              {DECISION_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <label style={styles.label} htmlFor="cad-amount">Approved amount</label>
            <input id="cad-amount" type="number" min="0" step="0.01" style={styles.input} value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} disabled={!authorized} />
            <label style={styles.label} htmlFor="cad-product">Approved product</label>
            <input id="cad-product" type="text" style={styles.input} value={approvedProduct} onChange={(e) => setApprovedProduct(e.target.value)} disabled={!authorized} />
            <label style={styles.label} htmlFor="cad-term">Approved term (months)</label>
            <input id="cad-term" type="number" min="0" style={styles.input} value={approvedTermMonths} onChange={(e) => setApprovedTermMonths(e.target.value)} disabled={!authorized} />
            <label style={styles.label} htmlFor="cad-pricing">Approved pricing</label>
            <input id="cad-pricing" type="text" style={styles.input} value={approvedPricing} onChange={(e) => setApprovedPricing(e.target.value)} disabled={!authorized} />
            <label style={styles.label} htmlFor="cad-collateral">Collateral summary</label>
            <textarea id="cad-collateral" style={styles.textarea} value={collateralSummary} onChange={(e) => setCollateralSummary(e.target.value)} disabled={!authorized} />
            <label style={styles.label} htmlFor="cad-conditions">Conditions of approval (one per line)</label>
            <textarea id="cad-conditions" style={styles.textarea} value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} disabled={!authorized} />
            <label style={styles.label} htmlFor="cad-rationale">Rationale (required)</label>
            <textarea id="cad-rationale" style={styles.textarea} value={rationale} onChange={(e) => setRationale(e.target.value)} disabled={!authorized} required />
            {submitError && (
              <p style={styles.error} role="alert" data-credit-approval-decision-error>
                {submitError}
              </p>
            )}
            <button type="submit" style={styles.submitButton} disabled={!authorized}>
              Record decision
            </button>
          </form>
        </>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  note: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  error: { margin: 0, color: palette.blocked, fontSize: typography.size.sm },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  listItem: { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: spacing.sm },
  muted: { color: palette.textMuted, fontSize: typography.size.xs },
  rationale: { margin: `${spacing.xs} 0 0`, fontSize: typography.size.sm, color: palette.textMuted },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.xs, marginTop: spacing.md },
  label: { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold },
  input: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, font: 'inherit' },
  textarea: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, font: 'inherit', minHeight: '4em' },
  submitButton: {
    alignSelf: 'flex-start',
    background: palette.primary,
    color: palette.primaryFg,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    font: 'inherit',
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
};
