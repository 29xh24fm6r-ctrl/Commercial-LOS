import { useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import { deriveFundingReadiness } from './fundingReadiness';
import type { FundingAuthorizationRecord, FundingReadinessFacts } from './fundingAuthorizationTypes';

/**
 * final-seven-workstreams Workstream 7 — the Funding Authorization panel: current readiness +
 * blockers, request details, approval chain (first/second approver), approve/reject controls,
 * revoked-state disclosure, disbursement confirmation, and audit history (via `auditEventIds`
 * count — the actual audit rows live wherever the caller's audit sink writes them; this panel does
 * not re-fetch or render their content, only that they exist).
 *
 * NOT mounted anywhere in the live app yet (see src/navigation/intentionallyUnrouted.ts) — no live
 * Dataverse storage exists for funding-authorization records (see
 * fundingAuthorizationStorage.ts's doc comment).
 */
export interface FundingAuthorizationPanelProps {
  readonly record: FundingAuthorizationRecord | undefined;
  readonly readinessFacts: FundingReadinessFacts;
  readonly authorizedFacilityAmount: number;
  readonly currentActorEmail: string;
  readonly canApprove: boolean;
  readonly onApprove: (approvedAmount: number) => Promise<void>;
  readonly onReject: () => Promise<void>;
  readonly onRevoke: () => Promise<void>;
  readonly onConfirmDisbursement: (fundingDate: string) => Promise<void>;
}

const BLOCKER_LABEL: Record<string, string> = {
  required_documents_incomplete: 'Required documents are incomplete',
  conditions_precedent_unresolved: 'Conditions precedent are unresolved',
  exceptions_unresolved: 'Open exceptions remain unresolved',
  destination_not_verified: 'Funding destination is not verified',
  approval_expired: 'The current approval has expired',
  deal_declined: 'The deal has been declined',
  deal_withdrawn: 'The deal has been withdrawn',
  deal_already_boarded: 'The deal is already boarded',
};

export function FundingAuthorizationPanel({
  record,
  readinessFacts,
  authorizedFacilityAmount,
  currentActorEmail,
  canApprove,
  onApprove,
  onReject,
  onRevoke,
  onConfirmDisbursement,
}: FundingAuthorizationPanelProps) {
  const [busy, setBusy] = useState(false);
  const [fundingDate, setFundingDate] = useState('');
  const readiness = deriveFundingReadiness(readinessFacts);

  if (!record) {
    return (
      <div style={styles.panel} data-funding-authorization-panel data-status="NOT_REQUESTED">
        <h2 style={styles.title}>Funding Authorization</h2>
        <p style={styles.subtitle}>No funding has been requested for this deal yet.</p>
      </div>
    );
  }

  const isSelfApprovalRisk = currentActorEmail.trim().toLowerCase() === record.requestedBy.trim().toLowerCase();

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.panel} data-funding-authorization-panel data-status={record.authorizationStatus}>
      <h2 style={styles.title}>Funding Authorization</h2>
      <dl style={styles.detailList}>
        <div style={styles.detailRow}>
          <dt style={styles.detailLabel}>Status</dt>
          <dd style={styles.detailValue} data-testid="funding-status">{record.authorizationStatus}</dd>
        </div>
        <div style={styles.detailRow}>
          <dt style={styles.detailLabel}>Requested amount</dt>
          <dd style={styles.detailValue}>${record.requestedAmount.toLocaleString()}</dd>
        </div>
        <div style={styles.detailRow}>
          <dt style={styles.detailLabel}>Authorized facility amount</dt>
          <dd style={styles.detailValue}>${authorizedFacilityAmount.toLocaleString()}</dd>
        </div>
        {record.approvedAmount !== undefined && (
          <div style={styles.detailRow}>
            <dt style={styles.detailLabel}>Approved amount</dt>
            <dd style={styles.detailValue}>${record.approvedAmount.toLocaleString()}</dd>
          </div>
        )}
        <div style={styles.detailRow}>
          <dt style={styles.detailLabel}>Requested by</dt>
          <dd style={styles.detailValue}>{record.requestedBy}</dd>
        </div>
        {record.authorizedBy && (
          <div style={styles.detailRow}>
            <dt style={styles.detailLabel}>First approver</dt>
            <dd style={styles.detailValue}>{record.authorizedBy}</dd>
          </div>
        )}
        {record.secondApprovedBy && (
          <div style={styles.detailRow}>
            <dt style={styles.detailLabel}>Second approver</dt>
            <dd style={styles.detailValue}>{record.secondApprovedBy}</dd>
          </div>
        )}
        <div style={styles.detailRow}>
          <dt style={styles.detailLabel}>Audit events recorded</dt>
          <dd style={styles.detailValue} data-testid="funding-audit-count">{record.auditEventIds.length}</dd>
        </div>
      </dl>

      {record.authorizationStatus === 'REVOKED' && (
        <p style={styles.warning} role="status">
          This authorization was revoked. A fresh funding request is required to re-authorize.
        </p>
      )}
      {record.authorizationStatus === 'REJECTED' && (
        <p style={styles.blocked} role="status">
          This funding request was rejected.
        </p>
      )}

      {(record.authorizationStatus === 'PENDING' || record.authorizationStatus === 'BLOCKED') && (
        <div style={styles.actions}>
          {isSelfApprovalRisk && (
            <p style={styles.blocked} role="alert">
              You requested this funding and cannot also approve it.
            </p>
          )}
          <button
            type="button"
            style={styles.primaryButton}
            disabled={!canApprove || isSelfApprovalRisk || busy}
            onClick={() => run(() => onApprove(record.approvedAmount ?? record.requestedAmount))}
          >
            {record.authorizedBy ? 'Record second approval' : 'Approve'}
          </button>
          <button type="button" style={styles.secondaryButton} disabled={!canApprove || busy} onClick={() => run(onReject)}>
            Reject
          </button>
        </div>
      )}

      {record.authorizationStatus === 'APPROVED' && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Disbursement readiness</h3>
          {readiness.ready ? (
            <p style={styles.eligible}>Ready to fund.</p>
          ) : (
            <ul style={styles.blockerList} data-testid="funding-blockers">
              {readiness.blockers.map((b) => (
                <li key={b} style={styles.blocked}>
                  {BLOCKER_LABEL[b] ?? b}
                </li>
              ))}
            </ul>
          )}
          <div style={styles.actions}>
            <input
              type="date"
              aria-label="Funding date"
              value={fundingDate}
              onChange={(e) => setFundingDate(e.target.value)}
              style={styles.input}
            />
            <button
              type="button"
              style={styles.primaryButton}
              disabled={!readiness.ready || !fundingDate || busy}
              onClick={() => run(() => onConfirmDisbursement(fundingDate))}
            >
              Confirm disbursement
            </button>
            <button type="button" style={styles.secondaryButton} disabled={busy} onClick={() => run(onRevoke)}>
              Revoke approval
            </button>
          </div>
        </div>
      )}

      {record.authorizationStatus === 'FUNDED' && (
        <p style={styles.eligible} data-testid="funding-funded-date">
          Funded on {record.fundingDate}.
        </p>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  title: { margin: 0, color: palette.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  detailList: { margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  detailRow: { display: 'flex', justifyContent: 'space-between', gap: spacing.sm },
  detailLabel: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  detailValue: { margin: 0, color: palette.text, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  sectionTitle: { margin: 0, color: palette.text, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  eligible: { margin: 0, color: palette.clear, fontSize: typography.size.sm },
  blocked: { margin: 0, color: palette.blocked, fontSize: typography.size.sm },
  warning: { margin: 0, color: palette.atRiskFg, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  blockerList: { margin: 0, paddingLeft: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  actions: { display: 'flex', gap: spacing.sm, alignItems: 'center' },
  primaryButton: {
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
    background: 'transparent',
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    font: 'inherit',
    cursor: 'pointer',
  },
  input: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    background: palette.surface,
    color: palette.text,
    font: 'inherit',
  },
};
