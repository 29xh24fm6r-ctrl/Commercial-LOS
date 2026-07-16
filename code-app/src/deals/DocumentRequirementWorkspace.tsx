import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  validActionsForStatus,
  describeRequirementStatus,
  isRequirementSatisfied,
  type DocumentRequirementAction,
  type DocumentRequirementRow,
} from './documentRequirementLifecycle';
import { deriveRequiredDocuments, type DocumentRequirementDerivationInput, type RequiredDocumentDefinition } from './documentRequirementDerivation';
import { loadDocumentRequirements } from './documentRequirementLiveReader';
import { performDocumentRequirementAction, type DocumentRequirementActionOutcome } from './documentRequirementActions';
import { buildLiveDocumentRequirementActionDeps } from './documentRequirementLiveDeps';
import { deriveBankerIdentityGatedAvailability } from './bankerIdentityGatedAvailability';

/**
 * The real banker-managed underwriting document requirement workspace —
 * replaces the retired DocumentChecklistPilotPanel. Requirements are derived
 * from the deal's own attributes (documentRequirementDerivation.ts), never a
 * hardcoded name list, and reconciled against live cr664_documentchecklist
 * rows (documentRequirementReconciliation.ts). Every action routes through
 * performDocumentRequirementAction — authenticated, audited, duplicate-safe,
 * bound to the authorized deal and banker.
 */

const ACTION_LABEL: Readonly<Record<DocumentRequirementAction, string>> = Object.freeze({
  acknowledge: 'Acknowledge Required',
  request: 'Request Document',
  receive: 'Mark Received',
  review: 'Mark Reviewed',
  return_for_correction: 'Return for Correction',
  waive: 'Waive',
  mark_not_applicable: 'Mark Not Applicable',
  reopen: 'Reopen',
});

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: readonly DocumentRequirementRow[] }
  | { kind: 'failed'; message: string };

export interface DocumentRequirementWorkspaceProps {
  readonly dealId: string;
  readonly deal: DocumentRequirementDerivationInput;
  readonly banker: { readonly systemUserId: string | undefined; readonly email: string | undefined; readonly fullName: string | undefined } | null;
  /** Bubbles up so the shared Documents/Due-Diligence/Tasks-&-Actions/borrower-comm-prep
   *  read surfaces (all sourced off the same cr664_documentchecklist rows) refresh too. */
  readonly onAfterAction?: () => void;
  /** Fires after every (re)load so a caller can fold these rows into its own blocker
   *  computation — see documentRequirementBlockerMerge.ts. */
  readonly onRowsLoaded?: (rows: readonly DocumentRequirementRow[], definitions: readonly RequiredDocumentDefinition[]) => void;
}

export function DocumentRequirementWorkspace({ dealId, deal, banker, onAfterAction, onRowsLoaded }: DocumentRequirementWorkspaceProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [pendingRowKey, setPendingRowKey] = useState<string | null>(null);
  const [waiveDraft, setWaiveDraft] = useState<{ key: string; reason: string } | null>(null);
  const [outcomeByRow, setOutcomeByRow] = useState<Record<string, DocumentRequirementActionOutcome>>({});
  // Guards every setState after an in-flight load/action against firing once this
  // instance has unmounted (e.g. the banker navigated away mid-request).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Deliberately does NOT setState('loading') at the top: the initial mount already
  // starts in 'loading' (the useState default above), and a refresh after an action
  // keeps showing the current rows until the new ones land — no flicker, and no
  // synchronous setState inside the mount effect's call stack.
  const load = useCallback(async () => {
    const result = await loadDocumentRequirements({ dealId, deal });
    if (!mountedRef.current) return;
    setState(result.kind === 'ready' ? { kind: 'ready', rows: result.rows } : { kind: 'failed', message: result.message });
    if (result.kind === 'ready') onRowsLoaded?.(result.rows, deriveRequiredDocuments(deal));
  }, [dealId, deal, onRowsLoaded]);

  useEffect(() => {
    void load();
    // deal is a plain-value snapshot recomputed by the caller each render; comparing by
    // dealId alone (not the whole object) avoids a reload loop from a fresh object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  async function runAction(row: DocumentRequirementRow, action: DocumentRequirementAction, extra?: { reviewerName?: string; waiverReason?: string }) {
    const rowKey = row.id ?? row.documentName;
    setPendingRowKey(rowKey);
    const outcome = await performDocumentRequirementAction(
      {
        action,
        dealId,
        documentId: row.id,
        documentName: row.documentName,
        currentStatus: row.status,
        systemUserId: banker?.systemUserId,
        actorEmail: banker?.email,
        reviewerName: extra?.reviewerName,
        waiverReason: extra?.waiverReason,
      },
      banker?.systemUserId ? buildLiveDocumentRequirementActionDeps() : undefined,
    );
    if (!mountedRef.current) return;
    setPendingRowKey(null);
    setOutcomeByRow((prev) => ({ ...prev, [rowKey]: outcome }));
    if (outcome.kind === 'success' || outcome.kind === 'already-acknowledged') {
      await load();
      if (!mountedRef.current) return;
      onAfterAction?.();
    }
  }

  // Factory Arc Phase 6 — same normalized CapabilityAvailability DealDocuments.tsx
  // uses for the same underlying identity fact (this component receives no
  // writeDisabledReason prop, so only systemUserId is considered — identical to
  // the prior Boolean(banker?.systemUserId) check). Computed before the
  // loading/failed early returns below so hook order stays unconditional. Not
  // memoized: new Date() inside a useMemo body defeats React Compiler's
  // memoization-preservation check, and this derivation is cheap regardless.
  const documentRequirementWritesAvailability = deriveBankerIdentityGatedAvailability(
    'document-requirement-writes',
    { systemUserId: banker?.systemUserId },
    new Date().toISOString(),
  );
  const canWrite = documentRequirementWritesAvailability.available;

  if (state.kind === 'loading') {
    return <p style={styles.muted}>Loading document requirements…</p>;
  }
  if (state.kind === 'failed') {
    return (
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load document requirements</div>
        <div style={styles.errorDetail}>{state.message}</div>
      </div>
    );
  }

  return (
    <section style={styles.wrap} aria-label="Document Requirements" data-doc-requirement-workspace="panel">
      <header style={styles.head}>
        <h3 style={styles.title}>Document Requirements</h3>
        <p style={styles.subtitle}>
          Derived from this deal&rsquo;s type, product, borrower, guarantors, collateral, and stage.
        </p>
      </header>
      <ul style={styles.list}>
        {state.rows.map((row) => {
          const rowKey = row.id ?? row.documentName;
          const pending = pendingRowKey === rowKey;
          const satisfied = isRequirementSatisfied(row);
          const outcome = outcomeByRow[rowKey];
          const waiving = waiveDraft?.key === rowKey;
          return (
            <li key={rowKey} style={styles.row} data-doc-requirement-row data-doc-requirement-status={row.status}>
              <div style={styles.rowHead}>
                <span style={styles.rowName}>{row.documentName}</span>
                <Badge variant={satisfied ? 'clear' : 'atRisk'} appearance="outline">
                  {describeRequirementStatus(row)}
                </Badge>
              </div>
              <div style={styles.rowMeta}>
                {row.acknowledgedDate && <Meta label="Acknowledged" value={row.acknowledgedDate} />}
                {row.requestedDate && <Meta label="Requested" value={row.requestedDate} />}
                {row.receivedDate && <Meta label="Received" value={row.receivedDate} />}
                {row.reviewedDate && <Meta label="Reviewed" value={row.reviewedDate} />}
                {row.waiverReason && <Meta label="Waiver reason" value={row.waiverReason} />}
              </div>
              {canWrite && (
                <div style={styles.actionRow}>
                  {validActionsForStatus(row.status).map((action) =>
                    action === 'waive' ? (
                      <button
                        key={action}
                        type="button"
                        disabled={pending}
                        style={styles.actionButton}
                        onClick={() => setWaiveDraft({ key: rowKey, reason: '' })}
                        data-doc-requirement-action={action}
                      >
                        {ACTION_LABEL[action]}
                      </button>
                    ) : (
                      <button
                        key={action}
                        type="button"
                        disabled={pending}
                        style={styles.actionButton}
                        onClick={() =>
                          void runAction(row, action, action === 'review' ? { reviewerName: banker?.fullName } : undefined)
                        }
                        data-doc-requirement-action={action}
                      >
                        {ACTION_LABEL[action]}
                      </button>
                    ),
                  )}
                </div>
              )}
              {waiving && (
                <div style={styles.waiveBox}>
                  <label style={styles.waiveLabel} htmlFor={`waiver-reason-${rowKey}`}>
                    Waiver reason (required)
                  </label>
                  <textarea
                    id={`waiver-reason-${rowKey}`}
                    style={styles.waiveInput}
                    value={waiveDraft.reason}
                    onChange={(e) => setWaiveDraft({ key: rowKey, reason: e.target.value })}
                  />
                  <div style={styles.actionRow}>
                    <button
                      type="button"
                      disabled={pending || waiveDraft.reason.trim().length === 0}
                      style={styles.actionButton}
                      onClick={() => {
                        const reason = waiveDraft.reason;
                        setWaiveDraft(null);
                        void runAction(row, 'waive', { waiverReason: reason });
                      }}
                      data-doc-requirement-waive-confirm
                    >
                      Confirm waiver
                    </button>
                    <button type="button" style={styles.cancelButton} onClick={() => setWaiveDraft(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {outcome && (
                <p
                  role="status"
                  style={outcome.kind === 'success' || outcome.kind === 'already-acknowledged' ? styles.outcomeOk : styles.outcomeError}
                  data-doc-requirement-outcome={outcome.kind}
                >
                  {describeOutcome(outcome)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function describeOutcome(outcome: DocumentRequirementActionOutcome): string {
  switch (outcome.kind) {
    case 'success':
      return `Updated — now ${describeRequirementStatus({ required: true, status: outcome.status })}.`;
    case 'already-acknowledged':
      return 'This requirement was already acknowledged.';
    case 'invalid-transition':
      return outcome.reason;
    case 'invalid-input':
      return outcome.reason;
    case 'unauthorized':
      return outcome.message;
    case 'write-failed':
      return `Could not save: ${outcome.error}`;
    case 'governance-partial':
      return `Saved, but governance logging failed (audit: ${outcome.auditError ?? 'ok'}, timeline: ${outcome.timelineError ?? 'ok'}). Do not retry.`;
    case 'dependency_not_ready':
      return outcome.detail;
    case 'unknown':
      return outcome.message;
    default:
      return 'Action did not complete.';
  }
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value}</span>
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.lg}`,
    marginTop: spacing.md,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  list: { display: 'flex', flexDirection: 'column', gap: spacing.sm, listStyle: 'none', margin: 0, padding: 0 },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surface,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
  },
  rowHead: { display: 'flex', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  rowName: { fontWeight: typography.weight.semibold, color: palette.text, fontSize: typography.size.base },
  rowMeta: { display: 'flex', gap: spacing.md, flexWrap: 'wrap', fontSize: typography.size.xs, color: palette.textMuted },
  metaItem: { display: 'inline-flex', gap: 4 },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.textMuted },
  actionRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xxs },
  actionButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  cancelButton: {
    background: 'transparent',
    color: palette.textMuted,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  waiveBox: { display: 'flex', flexDirection: 'column', gap: spacing.xxs },
  waiveLabel: { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold },
  waiveInput: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: spacing.xs,
    fontSize: typography.size.sm,
    fontFamily: typography.family,
    minHeight: 48,
  },
  outcomeOk: { margin: 0, fontSize: typography.size.xs, color: palette.clearFg },
  outcomeError: { margin: 0, fontSize: typography.size.xs, color: palette.atRiskFg },
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    borderRadius: radius.md,
  },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
  },
  errorTitle: { color: palette.blockedFg, fontWeight: typography.weight.semibold, fontSize: typography.size.md },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
};
