import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import { createDataverseCommitmentStore } from '../commitment/commitmentRecordStore';
import { submitCommitmentAction, type CommitmentAction } from '../commitment/submitCommitmentAction';
import { evaluateCommitmentReadiness, type CommitmentRecord } from '../workflow/commitmentRecordTypes';
import type { CreditApprovalDecisionRecord } from '../workflow/creditApprovalDecisionTypes';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * Final LOS Completion arc — Workstream D. Mounts the durable Commitment Record
 * (submitCommitmentAction.ts / commitmentRecordStore.ts) into the Deal Workspace, alongside the
 * existing read-only ClosingBookingReadinessPanel. Proves the full loop this arc requires: user
 * action -> authorized write -> durable record -> reload -> exact-record readback
 * (listCommitmentsForDeal on mount) -> downstream consumption (this same list is what
 * COMMITMENT:commitment_issued / :borrower_acceptance now read via evaluateCommitmentReadiness).
 *
 * Same disclosed caveat as every other new-entity adapter this arc adds: the backing table has not
 * been applied to any live Dataverse environment yet (see commitmentRecordStore.ts's header), so
 * every live call here fails closed with a visible error until an operator applies the migration in
 * scripts/schema-migrations/final-arc-commitment-record/.
 */

export function DealCommitmentPanel({
  dealId,
  authorized,
  actorEmail,
  systemUserId,
  creditApprovalDecisions,
  onCommitmentActionSubmitted,
}: {
  dealId: string;
  authorized: boolean;
  actorEmail: string | undefined;
  systemUserId: string | undefined;
  /** Gates ISSUE — see submitCommitmentAction.ts's class doc. */
  creditApprovalDecisions: readonly CreditApprovalDecisionRecord[] | undefined;
  onCommitmentActionSubmitted?: () => void;
}) {
  const storeRef = useRef(createDataverseCommitmentStore());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [commitments, setCommitments] = useState<readonly CommitmentRecord[]>([]);
  const [keyTermsSummary, setKeyTermsSummary] = useState('');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [approvedProduct, setApprovedProduct] = useState('');
  const [approvedTermMonths, setApprovedTermMonths] = useState('');
  const [approvedPricing, setApprovedPricing] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const email = actorEmail ?? '';

  function load() {
    setLoadState('loading');
    setLoadError(undefined);
    storeRef.current
      .listCommitmentsForDeal(dealId)
      .then((res) => {
        if (res.success) {
          setCommitments(res.commitments ?? []);
          setLoadState('ready');
        } else {
          setLoadState('error');
          setLoadError(res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load commitment records.');
        }
      })
      .catch((err: unknown) => {
        setLoadState('error');
        const raw = err instanceof Error ? err.message : String(err);
        setLoadError(mapBusinessSafeError(raw).safeMessage);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  const readiness = evaluateCommitmentReadiness(commitments, dealId);
  const pending = readiness.currentCommitment?.status === 'ISSUED' ? readiness.currentCommitment : undefined;

  async function act(action: CommitmentAction) {
    setSubmitError(undefined);
    setSubmitting(true);
    const outcome = await submitCommitmentAction(
      {
        dealId,
        action,
        approvedAmount: approvedAmount.trim() ? Number(approvedAmount) : undefined,
        approvedProduct: approvedProduct.trim() || undefined,
        approvedTermMonths: approvedTermMonths.trim() ? Number(approvedTermMonths) : undefined,
        approvedPricing: approvedPricing.trim() || undefined,
        keyTermsSummary: action === 'ISSUE' ? keyTermsSummary : undefined,
        expirationDateIso: expirationDate.trim() || undefined,
        declineReason: action === 'DECLINE' ? declineReason : undefined,
        actorEmail: email,
        systemUserId: systemUserId ?? '',
        creditApprovalDecisions,
      },
      storeRef.current,
    );
    setSubmitting(false);
    if (outcome.kind === 'success') {
      setKeyTermsSummary('');
      setApprovedAmount('');
      setApprovedProduct('');
      setApprovedTermMonths('');
      setApprovedPricing('');
      setExpirationDate('');
      setDeclineReason('');
      load();
      onCommitmentActionSubmitted?.();
    } else if (outcome.kind === 'governance-partial') {
      load();
      onCommitmentActionSubmitted?.();
      setSubmitError([outcome.auditError, outcome.timelineError].filter(Boolean).join(' '));
    } else if (outcome.kind === 'invalid-input') {
      setSubmitError(outcome.message);
    } else {
      setSubmitError(outcome.error);
    }
  }

  async function onIssueSubmit(e: FormEvent) {
    e.preventDefault();
    await act('ISSUE');
  }

  return (
    <Card>
      <CardHeader title="Commitment" subtitle="Commitment letter issuance and the borrower's response — a durable record of both." />
      {loadState === 'loading' && (
        <p style={styles.note} role="status" data-commitment-loading>
          Loading commitment records…
        </p>
      )}
      {loadState === 'error' && (
        <p style={styles.error} role="alert" data-commitment-load-error>
          Could not load commitment records: {loadError}
        </p>
      )}
      {loadState === 'ready' && (
        <>
          {commitments.length === 0 ? (
            <p style={styles.note}>No commitment has been issued yet for this deal.</p>
          ) : (
            <ul style={styles.list} data-commitment-list>
              {commitments.map((c) => (
                <li key={c.commitmentId} style={styles.listItem}>
                  <Badge variant={c.status === 'DECLINED' ? 'blocked' : c.status === 'ACCEPTED' ? 'clear' : 'neutral'}>
                    {c.status}
                  </Badge>{' '}
                  {c.approvedAmount !== undefined && <strong>${c.approvedAmount.toLocaleString()}</strong>}
                  <p style={styles.rationale}>{c.status === 'DECLINED' ? c.declineReason : c.keyTermsSummary}</p>
                </li>
              ))}
            </ul>
          )}

          {submitError && (
            <p style={styles.error} role="alert" data-commitment-error>
              {submitError}
            </p>
          )}

          {pending ? (
            <div style={styles.actionsRow} data-commitment-response-actions>
              <button type="button" style={styles.submitButton} disabled={!authorized || submitting} onClick={() => act('ACCEPT')}>
                Record borrower acceptance
              </button>
              <div style={styles.form}>
                <label style={styles.label} htmlFor="cmt-decline-reason">Decline reason</label>
                <textarea
                  id="cmt-decline-reason"
                  style={styles.textarea}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  disabled={!authorized || submitting}
                />
                <button type="button" style={styles.secondaryButton} disabled={!authorized || submitting} onClick={() => act('DECLINE')}>
                  Record decline
                </button>
              </div>
              <button type="button" style={styles.secondaryButton} disabled={!authorized || submitting} onClick={() => act('WITHDRAW')}>
                Withdraw commitment
              </button>
              <button type="button" style={styles.secondaryButton} disabled={!authorized || submitting} onClick={() => act('EXPIRE')}>
                Mark expired
              </button>
            </div>
          ) : (
            <form style={styles.form} onSubmit={onIssueSubmit} data-commitment-issue-form>
              <label style={styles.label} htmlFor="cmt-amount">Approved amount</label>
              <input id="cmt-amount" type="number" min="0" step="0.01" style={styles.input} value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} disabled={!authorized} />
              <label style={styles.label} htmlFor="cmt-product">Approved product</label>
              <input id="cmt-product" type="text" style={styles.input} value={approvedProduct} onChange={(e) => setApprovedProduct(e.target.value)} disabled={!authorized} />
              <label style={styles.label} htmlFor="cmt-term">Approved term (months)</label>
              <input id="cmt-term" type="number" min="0" style={styles.input} value={approvedTermMonths} onChange={(e) => setApprovedTermMonths(e.target.value)} disabled={!authorized} />
              <label style={styles.label} htmlFor="cmt-pricing">Approved pricing</label>
              <input id="cmt-pricing" type="text" style={styles.input} value={approvedPricing} onChange={(e) => setApprovedPricing(e.target.value)} disabled={!authorized} />
              <label style={styles.label} htmlFor="cmt-expiration">Expiration date</label>
              <input id="cmt-expiration" type="date" style={styles.input} value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} disabled={!authorized} />
              <label style={styles.label} htmlFor="cmt-terms">Key terms summary (required)</label>
              <textarea id="cmt-terms" style={styles.textarea} value={keyTermsSummary} onChange={(e) => setKeyTermsSummary(e.target.value)} disabled={!authorized} required />
              <button type="submit" style={styles.submitButton} disabled={!authorized || submitting}>
                Issue commitment
              </button>
            </form>
          )}
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
  rationale: { margin: `${spacing.xs} 0 0`, fontSize: typography.size.sm, color: palette.textMuted },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.xs, marginTop: spacing.md },
  label: { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold },
  input: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, font: 'inherit' },
  textarea: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, font: 'inherit', minHeight: '4em' },
  actionsRow: { display: 'flex', flexDirection: 'column', gap: spacing.sm, marginTop: spacing.md },
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
  secondaryButton: {
    alignSelf: 'flex-start',
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    font: 'inherit',
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
};
