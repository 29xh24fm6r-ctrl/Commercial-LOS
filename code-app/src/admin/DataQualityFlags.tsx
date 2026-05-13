import { useState } from 'react';
import { useAdminData, type AsyncResult } from './AdminDataProvider';
import { useAdmin } from './AdminContext';
import type { DataQualityFlagRow } from './adminDiagnosticsQueries';
import { resolveDataQualityFlag, type ResolveOutcome } from './dataQualityActions';
import { ResolveFlagModal } from './ResolveFlagModal';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles, formatDate } from './adminCardChrome';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

const PREVIEW_LIMIT = 8;

export function DataQualityFlags() {
  const { dataQuality, refresh } = useAdminData();
  const admin = useAdmin();
  const [resolvingFlag, setResolvingFlag] = useState<DataQualityFlagRow | null>(null);

  async function handleConfirm(note: string): Promise<ResolveOutcome> {
    if (!resolvingFlag || !admin.systemUserId) {
      return {
        kind: 'unknown',
        message: 'Cannot submit: missing flag or system user id.',
      };
    }
    const outcome = await resolveDataQualityFlag({
      flagId: resolvingFlag.id,
      flagName: resolvingFlag.flagName,
      flagType: resolvingFlag.flagType,
      systemUserId: admin.systemUserId,
      resolutionNote: note,
    });
    // Refresh the affected cards on either success or audit-failed
    // (the flag IS resolved server-side in audit-failed; the list
    // should reflect that). On flag-failed, the flag is still Open;
    // refresh to make sure the list is in sync.
    refresh('after-resolve');
    return outcome;
  }

  return (
    <>
      <Card>
        <CardHeader title="Data Quality Flags" subtitle={subtitleFor(dataQuality)} />
        {admin.writeDisabledReason && (
          <p style={styles.writeDisabledBanner} role="status">
            <strong>Resolve disabled:</strong> {admin.writeDisabledReason}
          </p>
        )}
        <Body
          data={dataQuality}
          canWrite={!!admin.systemUserId}
          onResolve={(flag) => setResolvingFlag(flag)}
        />
      </Card>
      {resolvingFlag && (
        <ResolveFlagModal
          flag={resolvingFlag}
          onConfirm={handleConfirm}
          onClose={() => setResolvingFlag(null)}
        />
      )}
    </>
  );
}

function subtitleFor(r: AsyncResult<DataQualityFlagRow[]>): string | undefined {
  if (r.kind !== 'ready') return undefined;
  return `${r.data.length} open`;
}

function Body({
  data,
  canWrite,
  onResolve,
}: {
  data: AsyncResult<DataQualityFlagRow[]>;
  canWrite: boolean;
  onResolve: (flag: DataQualityFlagRow) => void;
}) {
  if (data.kind === 'loading') return <p style={adminStyles.muted}>Loading flags…</p>;
  if (data.kind === 'failed')
    return <ErrorBlock title="Could not load data quality flags" detail={data.message} />;
  if (data.data.length === 0) return <p style={adminStyles.muted}>No open flags.</p>;

  const preview = data.data.slice(0, PREVIEW_LIMIT);
  const overflow = data.data.length - preview.length;

  return (
    <>
      <ul style={adminStyles.list}>
        {preview.map((f) => (
          <li key={f.id} style={adminStyles.row}>
            <div style={adminStyles.rowHead}>
              <span style={adminStyles.rowTitle}>{f.flagName}</span>
              <div style={styles.rowTrailing}>
                <Badge variant={severityFromType(f.flagType)}>{f.flagType ?? 'Open'}</Badge>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => onResolve(f)}
                    style={styles.resolveButton}
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
            {f.flagDescription && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: palette.text, lineHeight: 1.4 }}>
                {f.flagDescription}
              </p>
            )}
            <div style={adminStyles.rowMeta}>
              <span>
                <span style={adminStyles.metaLabel}>Source:</span>{' '}
                {f.sourceTable ?? '—'}
              </span>
              <span>
                <span style={adminStyles.metaLabel}>Flagged:</span>{' '}
                {formatDate(f.flaggedDate) ?? '—'}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <CardFooter>
        <span>Sourced from cr664_DataQualityFlag where ResolutionStatus = Open.</span>
        {overflow > 0 && (
          <span>+ {overflow} more open flag{overflow === 1 ? '' : 's'} not shown.</span>
        )}
      </CardFooter>
    </>
  );
}

function severityFromType(t: string | undefined): SeverityKey {
  if (!t) return 'atRisk';
  const lower = t.toLowerCase();
  if (lower.includes('critical') || lower.includes('blocking')) return 'blocked';
  if (lower.includes('warning') || lower.includes('stale')) return 'atRisk';
  return 'neutral';
}

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={adminStyles.errorBox} role="alert">
      <div style={adminStyles.errorTitle}>{title}</div>
      <div style={adminStyles.errorDetail}>{detail}</div>
      <div style={adminStyles.errorHint}>Refresh to retry.</div>
    </div>
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
  rowTrailing: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  resolveButton: {
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
};
