import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FundingAuthorizationPanel } from '../funding/FundingAuthorizationPanel';
import { createDataverseFundingAuthorizationStore } from '../funding/fundingAuthorizationDataverseStore';
import { requestFunding } from '../funding/fundingRequestAdapter';
import { approveFunding, rejectFunding, revokeFunding } from '../funding/fundingApprovalAdapter';
import { confirmFundingDisbursement } from '../funding/fundingDisbursementConfirmation';
import { emitLiveFundingAudit } from '../funding/fundingAuditLiveDeps';
import type { FundingAuthorizationRecord, FundingReadinessFacts } from '../funding/fundingAuthorizationTypes';
import { recognizeCanonicalStatus } from '../workflow/statusReferenceContract';
import type { DealDetail } from './dealQueries';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * PR 112 -- mounts the funding-authorization framework (src/funding/*) against the durable,
 * Dataverse-backed store (`createDataverseFundingAuthorizationStore`, see
 * fundingAuthorizationDataverseStore.ts) -- replacing PR 111's session-scoped
 * `createInMemoryFundingAuthorizationStore()`. See Cr664_fundingauthorizationsModel.ts's own header
 * for this table's generation-disclosure status: the generated model/service were hand-authored to
 * match the already-reviewed entity.mjs schema, not produced by a real `pac code` regeneration
 * against a live org, so this component fails closed with a VISIBLE error (never a silent fallback)
 * if a live call doesn't behave as expected.
 *
 * Mounting a durable dual-control flow is honest, not fabricated: FundingAuthorizationPanel's own
 * `isSelfApprovalRisk` check and the policy engine's `self_approval_not_permitted` denial correctly
 * and automatically block a single actor from completing both sides of dual-control approval --
 * this holds identically whether the record lives in memory or in Dataverse.
 *
 * Factory Arc Phase 13 -- request/approve/reject/revoke/confirm all now emit a real cr664_AuditEvent
 * via emitLiveFundingAudit (fundingAuditLiveDeps.ts), closing the "no live audit sink" gap this
 * header used to disclose. A failed/unresolved audit never reverts the funding action that already
 * happened (recordFundingAudit's own fail-closed discipline, unchanged) -- see
 * docs/factory-arc/PR125_APPROVAL_CLOSING_FUNDING_BOARDING_PROOF.md.
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

export function DealFundingAuthorizationPanel({
  deal,
  authorized,
  actorEmail,
  onFundingConfirmed,
}: {
  deal: DealDetail;
  authorized: boolean;
  actorEmail: string | undefined;
  /**
   * Factory Arc Phase 12 — fired after a disbursement is genuinely confirmed (FUNDED), so a caller
   * embedded inside DealDataProvider can refresh its `fundingAuthorization` fact (feeds
   * CLOSING_FUNDING:funds_disbursed) without this component importing DealDataProvider directly —
   * that import pulls in the real generated-service graph and breaks this component's existing
   * standalone tests, which render it without a provider. See DealFundingAuthorizationPanelConnected.tsx
   * for the real wiring (BankerDealWorkspace.tsx renders that, not this component, directly).
   */
  onFundingConfirmed?: () => void;
}) {
  const storeRef = useRef(createDataverseFundingAuthorizationStore());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [record, setRecord] = useState<FundingAuthorizationRecord | undefined>(undefined);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestMethod, setRequestMethod] = useState('');
  const [requestError, setRequestError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const facts = useMemo(() => buildFundingReadinessFacts(deal), [deal]);
  const authorizedFacilityAmount = deal.amount ?? 0;
  const email = actorEmail ?? '';

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setLoadError(undefined);
    storeRef.current
      .getCurrentRecordForDeal(deal.id)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setRecord(res.record);
          setLoadState('ready');
        } else {
          setLoadState('error');
          // PR A remediation — res.error is a raw transport-failure string; never rendered verbatim.
          setLoadError(res.error ? mapBusinessSafeError(res.error).safeMessage : 'Could not load the funding authorization record.');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState('error');
        const raw = err instanceof Error ? err.message : String(err);
        setLoadError(mapBusinessSafeError(raw).safeMessage);
      });
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  async function onRequestSubmit(e: FormEvent) {
    e.preventDefault();
    setRequestError(undefined);
    const amount = Number(requestAmount);
    const outcome = await requestFunding(
      { dealId: deal.id, requestedAmount: amount, requestedBy: email, fundingMethod: requestMethod.trim() || undefined },
      { storage: storeRef.current, emitAudit: emitLiveFundingAudit },
    );
    if (outcome.kind === 'requested') {
      setRecord(outcome.record);
      setRequestAmount('');
      setRequestMethod('');
    } else if (outcome.kind === 'invalid_input') {
      setRequestError(outcome.reason);
    } else {
      // PR A remediation — outcome.error (write_failed) is a raw transport-failure string.
      setRequestError(mapBusinessSafeError(outcome.error, outcome.correlationId).safeMessage);
    }
  }

  async function onApprove(approvedAmount: number) {
    if (!record) return;
    setActionError(undefined);
    const outcome = await approveFunding(
      { record, approverEmail: email, approvedAmount, authorizedFacilityAmount },
      { storage: storeRef.current, emitAudit: emitLiveFundingAudit },
    );
    if (outcome.kind === 'first_approval_recorded' || outcome.kind === 'fully_approved') {
      setRecord(outcome.record);
    } else if (outcome.kind === 'denied') {
      setActionError(`Approval denied: ${outcome.reason}`);
    } else if (outcome.kind === 'write_failed') {
      setActionError(mapBusinessSafeError(outcome.error).safeMessage);
    }
  }

  async function onReject() {
    if (!record) return;
    setActionError(undefined);
    const outcome = await rejectFunding(record, email, { storage: storeRef.current, emitAudit: emitLiveFundingAudit });
    if (outcome.kind === 'rejected') {
      setRecord(outcome.record);
    } else if (outcome.kind === 'denied') {
      setActionError(`Rejection denied: ${outcome.reason}`);
    } else if (outcome.kind === 'write_failed') {
      setActionError(mapBusinessSafeError(outcome.error).safeMessage);
    }
  }

  async function onRevoke() {
    if (!record) return;
    setActionError(undefined);
    const outcome = await revokeFunding(record, email, { storage: storeRef.current, emitAudit: emitLiveFundingAudit });
    if (outcome.kind === 'revoked') {
      setRecord(outcome.record);
    } else if (outcome.kind === 'denied') {
      setActionError(`Revocation denied: ${outcome.reason}`);
    } else if (outcome.kind === 'write_failed') {
      setActionError(mapBusinessSafeError(outcome.error).safeMessage);
    }
  }

  async function onConfirmDisbursement(fundingDate: string) {
    if (!record) return;
    setActionError(undefined);
    const outcome = await confirmFundingDisbursement(
      { record, readinessFacts: facts, fundingDate, confirmedByActorEmail: email },
      { storage: storeRef.current, emitAudit: emitLiveFundingAudit },
    );
    if (outcome.kind === 'confirmed') {
      setRecord(outcome.record);
      // Factory Arc Phase 12 — the deal is now genuinely FUNDED; tell the caller so it can refresh
      // DealDataProvider's fundingAuthorization fact (feeds CLOSING_FUNDING:funds_disbursed) without
      // a page reload. Optional — never called when this component is rendered standalone (tests).
      onFundingConfirmed?.();
    } else if (outcome.kind === 'denied') {
      setActionError(`Disbursement denied: ${outcome.reason}`);
    } else if (outcome.kind === 'blocked') {
      setActionError(`Disbursement blocked: ${outcome.blockers.join(', ')}`);
    } else {
      setActionError(mapBusinessSafeError(outcome.error).safeMessage);
    }
  }

  if (loadState === 'loading') {
    return (
      <p style={styles.loadingNote} role="status" data-funding-authorization-loading>
        Loading funding authorization…
      </p>
    );
  }

  if (loadState === 'error') {
    return (
      <p style={styles.error} role="alert" data-funding-authorization-load-error>
        Could not load the funding authorization record: {loadError}
      </p>
    );
  }

  return (
    <>
      {actionError && (
        <p style={styles.error} role="alert" data-funding-authorization-action-error>
          {actionError}
        </p>
      )}
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
  loadingNote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
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
