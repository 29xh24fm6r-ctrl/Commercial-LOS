import { useMemo, useRef, useState, type FormEvent } from 'react';
import { FundingAuthorizationPanel } from '../funding/FundingAuthorizationPanel';
import { createInMemoryFundingAuthorizationStore } from '../funding/fundingAuthorizationStorage';
import { requestFunding } from '../funding/fundingRequestAdapter';
import { approveFunding, rejectFunding, revokeFunding } from '../funding/fundingApprovalAdapter';
import { confirmFundingDisbursement } from '../funding/fundingDisbursementConfirmation';
import type { EmitFundingAudit } from '../funding/fundingAudit';
import type { FundingAuthorizationRecord, FundingReadinessFacts } from '../funding/fundingAuthorizationTypes';
import { recognizeCanonicalStatus } from '../workflow/statusReferenceContract';
import type { DealDetail } from './dealQueries';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * PR 111 -- mounts the funding-authorization framework (src/funding/*, previously entirely
 * unmounted -- see docs/final-seven-workstreams/07_FUNDING_AUTHORIZATION_FRAMEWORK.md; no live
 * Dataverse table exists to persist authorization records). Same local-only pattern as
 * DealClosingDocumentsPanel (PR107): createInMemoryFundingAuthorizationStore() is a real, working
 * reference implementation -- NOT persistence, lost on reload -- so this wrapper says so plainly. A
 * no-op audit emitter is used for the same reason: auditing a non-durable record would be a false
 * signal.
 *
 * Mounting this local-only is honest, not fabricated: FundingAuthorizationPanel's own
 * `isSelfApprovalRisk` check and the policy engine's `self_approval_not_permitted` denial correctly
 * and automatically block a single actor from completing both sides of dual-control approval on
 * their own -- a single banker session cannot fake a two-person approval, so the demo accurately
 * reflects what one session can and cannot do.
 *
 * Real persistence needs an operator-authorized cr664_fundingauthorization-style table (schema
 * prepared in scripts/schema-migrations/pr107-funding-authorization/*.mjs, not yet applied) --
 * tracked as a NOT_WIRED entry, not built here.
 */
function buildFundingReadinessFacts(deal: DealDetail): FundingReadinessFacts {
  // dealTerminalStatus is derived honestly from the deal's real status via the same fail-closed
  // canonical resolver every other governed action in this app uses. An unrecognized/unresolved
  // status must never silently read as "OPEN" (an affirmative claim); it maps to 'DECLINED' -- a
  // blocking disposition -- rather than guessing the deal is fine.
  const dealTerminalStatus = recognizeCanonicalStatus(deal.status) ?? 'DECLINED';
  return {
    // No live source exists yet for document completeness, conditions-precedent resolution,
    // exception resolution, destination verification, or approval-expiry tracking (see
    // docs/final-seven-workstreams/07_FUNDING_AUTHORIZATION_FRAMEWORK.md). Fail-closed to the
    // blocking value rather than fabricate readiness -- this session will genuinely progress a
    // request through approval, but correctly always shows blocked at disbursement confirmation.
    requiredDocumentsComplete: false,
    conditionsPrecedentResolved: false,
    exceptionsAllResolved: false,
    destinationVerified: false,
    approvalExpired: false,
    dealTerminalStatus,
  };
}

const NO_LIVE_AUDIT_SINK: EmitFundingAudit = async () => ({
  success: false,
  error: 'Local-only session: no live audit sink is wired yet (see docs/final-seven-workstreams/07_FUNDING_AUTHORIZATION_FRAMEWORK.md).',
});

export function DealFundingAuthorizationPanel({
  deal,
  authorized,
  actorEmail,
}: {
  deal: DealDetail;
  authorized: boolean;
  actorEmail: string | undefined;
}) {
  const storeRef = useRef(createInMemoryFundingAuthorizationStore());
  const [record, setRecord] = useState<FundingAuthorizationRecord | undefined>(undefined);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestMethod, setRequestMethod] = useState('');
  const [requestError, setRequestError] = useState<string | undefined>(undefined);

  const facts = useMemo(() => buildFundingReadinessFacts(deal), [deal]);
  const authorizedFacilityAmount = deal.amount ?? 0;
  const email = actorEmail ?? '';

  async function onRequestSubmit(e: FormEvent) {
    e.preventDefault();
    setRequestError(undefined);
    const amount = Number(requestAmount);
    const outcome = await requestFunding(
      { dealId: deal.id, requestedAmount: amount, requestedBy: email, fundingMethod: requestMethod.trim() || undefined },
      { storage: storeRef.current, emitAudit: NO_LIVE_AUDIT_SINK },
    );
    if (outcome.kind === 'requested') {
      setRecord(outcome.record);
      setRequestAmount('');
      setRequestMethod('');
    } else if (outcome.kind === 'invalid_input') {
      setRequestError(outcome.reason);
    } else {
      setRequestError(outcome.error);
    }
  }

  async function onApprove(approvedAmount: number) {
    if (!record) return;
    const outcome = await approveFunding(
      { record, approverEmail: email, approvedAmount, authorizedFacilityAmount },
      { storage: storeRef.current, emitAudit: NO_LIVE_AUDIT_SINK },
    );
    if (outcome.kind === 'first_approval_recorded' || outcome.kind === 'fully_approved') setRecord(outcome.record);
  }

  async function onReject() {
    if (!record) return;
    const outcome = await rejectFunding(record, email, { storage: storeRef.current, emitAudit: NO_LIVE_AUDIT_SINK });
    if (outcome.kind === 'rejected') setRecord(outcome.record);
  }

  async function onRevoke() {
    if (!record) return;
    const outcome = await revokeFunding(record, email, { storage: storeRef.current, emitAudit: NO_LIVE_AUDIT_SINK });
    if (outcome.kind === 'revoked') setRecord(outcome.record);
  }

  async function onConfirmDisbursement(fundingDate: string) {
    if (!record) return;
    const outcome = await confirmFundingDisbursement(
      { record, readinessFacts: facts, fundingDate, confirmedByActorEmail: email },
      { storage: storeRef.current, emitAudit: NO_LIVE_AUDIT_SINK },
    );
    if (outcome.kind === 'confirmed') setRecord(outcome.record);
  }

  return (
    <>
      <p style={styles.localOnlyNote} role="note" data-funding-authorization-local-only-note>
        Funding requests and approvals are held for this browser session only — not yet saved to
        the deal. Real persistence needs an operator-authorized schema addition (see
        docs/final-seven-workstreams/07_FUNDING_AUTHORIZATION_FRAMEWORK.md).
      </p>
      {!record && (
        <form style={styles.requestForm} onSubmit={onRequestSubmit} data-funding-request-form>
          <label style={styles.label} htmlFor="funding-request-amount">
            Requested amount
          </label>
          <input
            id="funding-request-amount"
            type="number"
            min="0"
            step="0.01"
            style={styles.input}
            value={requestAmount}
            onChange={(e) => setRequestAmount(e.target.value)}
            disabled={!authorized}
          />
          <label style={styles.label} htmlFor="funding-request-method">
            Funding method (optional)
          </label>
          <input
            id="funding-request-method"
            type="text"
            style={styles.input}
            value={requestMethod}
            onChange={(e) => setRequestMethod(e.target.value)}
            disabled={!authorized}
          />
          {requestError && (
            <p style={styles.error} role="alert" data-funding-request-error>
              {requestError}
            </p>
          )}
          <button type="submit" style={styles.submitButton} disabled={!authorized}>
            Request funding
          </button>
        </form>
      )}
      <FundingAuthorizationPanel
        record={record}
        readinessFacts={facts}
        authorizedFacilityAmount={authorizedFacilityAmount}
        currentActorEmail={email}
        canApprove={authorized}
        onApprove={onApprove}
        onReject={onReject}
        onRevoke={onRevoke}
        onConfirmDisbursement={onConfirmDisbursement}
      />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  localOnlyNote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
    marginBottom: spacing.sm,
  },
  requestForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  label: { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold },
  input: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    font: 'inherit',
  },
  error: { margin: 0, color: palette.blocked, fontSize: typography.size.sm },
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
