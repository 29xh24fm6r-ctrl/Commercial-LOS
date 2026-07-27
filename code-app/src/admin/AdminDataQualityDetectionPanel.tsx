import { useState } from 'react';
import { useAdminData } from './AdminDataProvider';
import { useAdmin } from './AdminContext';
import {
  buildDataQualityFlagCandidates,
  excludeAlreadyFlagged,
  type DataQualityFlagCandidate,
} from './dataQuality/dataQualityFlagCandidates';
import { loadDataQualityScanInputs } from './dataQuality/loadDataQualityScanInputs';
import { createDataQualityFlag } from './createDataQualityFlagAction';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Final LOS Completion arc — Workstream O: admin-triggered detection sweep
 * for the six categories cr664_dataqualityflags has no detection rule for
 * (duplicate borrower/company, near-duplicate names, duplicate deals,
 * suspicious active deals, zero-amount deals, duplicate entitlements,
 * inconsistent boarding linkage). Deliberately manual, not automatic — Code
 * Apps have no server-side scheduled-job infrastructure, and every write
 * this panel makes is a governed, audited create the admin explicitly
 * requests one candidate at a time (never a bulk auto-apply).
 *
 * Never merges, deletes, or revokes anything — this only creates an
 * informational data-quality flag an admin can later act on through the
 * existing Data Quality Flags card.
 */

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'ready'; candidates: readonly DataQualityFlagCandidate[]; failedDomains: readonly { domain: string; message: string }[] }
  | { kind: 'failed'; message: string };

type CreateState = Record<string, 'creating' | 'created' | { error: string } | undefined>;

function candidateKey(c: DataQualityFlagCandidate): string {
  return `${c.sourceTable}|${c.sourceRecordId}|${c.flagName}`;
}

export function AdminDataQualityDetectionPanel() {
  const { dataQuality, refresh } = useAdminData();
  const admin = useAdmin();
  const [scan, setScan] = useState<ScanState>({ kind: 'idle' });
  const [createStates, setCreateStates] = useState<CreateState>({});

  async function runScan() {
    setScan({ kind: 'scanning' });
    try {
      const { inputs, failedDomains } = await loadDataQualityScanInputs();
      const allCandidates = buildDataQualityFlagCandidates(inputs);
      const openFlags = dataQuality.kind === 'ready' ? dataQuality.data : [];
      const candidates = excludeAlreadyFlagged(allCandidates, openFlags);
      setCreateStates({});
      setScan({ kind: 'ready', candidates, failedDomains });
    } catch (err: unknown) {
      setScan({
        kind: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleCreate(candidate: DataQualityFlagCandidate) {
    if (!admin.systemUserId) return;
    const key = candidateKey(candidate);
    setCreateStates((prev) => ({ ...prev, [key]: 'creating' }));
    const outcome = await createDataQualityFlag({ candidate, actorEmail: admin.upn });
    if (outcome.kind === 'success' || outcome.kind === 'audit-failed') {
      setCreateStates((prev) => ({ ...prev, [key]: 'created' }));
      refresh('after-dq-create');
    } else {
      const message = outcome.kind === 'create-failed' ? outcome.createError : outcome.message;
      setCreateStates((prev) => ({ ...prev, [key]: { error: message } }));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Data Quality Detection Sweep"
        subtitle="Duplicate / anomaly detection rules not covered by the six existing flag types"
      />
      {admin.writeDisabledReason && (
        <p style={styles.writeDisabledBanner} role="status">
          <strong>Flag creation disabled:</strong> {admin.writeDisabledReason}
        </p>
      )}
      <p style={adminStyles.muted}>
        Scans for duplicate/near-duplicate companies, duplicate deals (and active deals implicated
        in one), zero-amount active deals, duplicate admin entitlements, and inconsistent boarding
        linkage. Read-only until you choose to create a flag — never merges, deletes, or revokes
        anything automatically.
      </p>
      <button type="button" onClick={runScan} disabled={scan.kind === 'scanning'} style={styles.scanButton}>
        {scan.kind === 'scanning' ? 'Scanning…' : 'Scan for data quality issues'}
      </button>
      <Body scan={scan} canWrite={!!admin.systemUserId} createStates={createStates} onCreate={handleCreate} />
    </Card>
  );
}

function Body({
  scan,
  canWrite,
  createStates,
  onCreate,
}: {
  scan: ScanState;
  canWrite: boolean;
  createStates: CreateState;
  onCreate: (candidate: DataQualityFlagCandidate) => void;
}) {
  if (scan.kind === 'idle') return null;
  if (scan.kind === 'scanning') return <p style={adminStyles.muted}>Scanning…</p>;
  if (scan.kind === 'failed') {
    return (
      <div style={adminStyles.errorBox} role="alert">
        <div style={adminStyles.errorTitle}>Scan failed</div>
        <div style={adminStyles.errorDetail}>{scan.message}</div>
      </div>
    );
  }

  if (scan.candidates.length === 0) {
    return (
      <>
        <p style={adminStyles.muted}>No new data quality issues detected.</p>
        {scan.failedDomains.length > 0 && <FailedDomainsNote failedDomains={scan.failedDomains} />}
      </>
    );
  }

  return (
    <>
      <ul style={adminStyles.list}>
        {scan.candidates.map((c) => {
          const key = candidateKey(c);
          const state = createStates[key];
          return (
            <li key={key} style={adminStyles.row}>
              <div style={adminStyles.rowHead}>
                <span style={adminStyles.rowTitle}>{c.flagName}</span>
                <Badge variant="atRisk">{c.category}</Badge>
              </div>
              <p style={styles.description}>{c.flagDescription}</p>
              <div style={adminStyles.rowMeta}>
                <span>
                  <span style={adminStyles.metaLabel}>Source:</span> {c.sourceTable} / {c.sourceRecordId}
                </span>
              </div>
              {canWrite && (
                <div style={styles.actionsRow}>
                  {state === 'created' ? (
                    <Badge variant="clear">Flag created</Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onCreate(c)}
                      disabled={state === 'creating'}
                      style={styles.createButton}
                    >
                      {state === 'creating' ? 'Creating…' : 'Create flag'}
                    </button>
                  )}
                  {state && typeof state === 'object' && (
                    <span role="alert" style={styles.errorText}>
                      {state.error}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <CardFooter>
        <span>
          {scan.candidates.length} candidate{scan.candidates.length === 1 ? '' : 's'} not already
          flagged open.
        </span>
      </CardFooter>
      {scan.failedDomains.length > 0 && <FailedDomainsNote failedDomains={scan.failedDomains} />}
    </>
  );
}

function FailedDomainsNote({
  failedDomains,
}: {
  failedDomains: readonly { domain: string; message: string }[];
}) {
  return (
    <p style={styles.partialNote} role="status">
      Could not scan: {failedDomains.map((f) => f.domain).join(', ')}. Results above are partial,
      not a claim of full coverage.
    </p>
  );
}

const styles: Record<string, React.CSSProperties> = {
  writeDisabledBanner: {
    margin: 0,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.atRiskBg,
    color: palette.atRiskFg,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.atRiskBg}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  scanButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    marginBottom: spacing.sm,
  },
  description: {
    margin: 0,
    fontSize: '0.9rem',
    color: palette.text,
    lineHeight: 1.4,
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTop: `1px solid ${palette.divider}`,
    marginTop: spacing.xxs,
  },
  createButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  errorText: {
    color: palette.blockedFg,
    fontSize: typography.size.xs,
  },
  partialNote: {
    margin: 0,
    marginTop: spacing.xs,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
};
