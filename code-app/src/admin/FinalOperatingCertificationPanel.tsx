import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  FINAL_CERTIFICATION_STATUSES,
  deriveFinalOperatingCertification,
  type FinalCertificationStatus,
} from './finalOperatingCertification';

const LABEL: Record<FinalCertificationStatus, string> = {
  'code-complete': 'Code complete',
  'schema-provisioned': 'Schema provisioned',
  'datasource-registered': 'Datasource registered',
  'runtime-enabled': 'Runtime enabled',
  'live-smoke-tested': 'Live smoke tested',
  'blocked-missing-evidence': 'Blocked: missing evidence',
  'blocked-dual-user-testing': 'Blocked: dual-user test',
  'intentionally-deferred': 'Intentionally deferred',
};

export function FinalOperatingCertificationPanel() {
  const report = deriveFinalOperatingCertification();
  return (
    <section aria-label="Final operating certification" data-final-operating-certification>
      <Card accentColor={palette.blocked}>
        <CardHeader
          title="Final Operating Certification"
          subtitle="Evidence-backed distinction between implementation, environment readiness, activation, and live proof."
          trailing={<Badge variant="blocked">NOT PRODUCTION GO</Badge>}
        />
        <p style={styles.summary}>{report.summary}</p>
        {FINAL_CERTIFICATION_STATUSES.map((status) => {
          const rows = report.findings.filter((finding) => finding.status === status);
          if (rows.length === 0) return null;
          const blocked = status.startsWith('blocked-');
          return (
            <section key={status} style={styles.group} data-certification-status={status}>
              <h3 style={styles.groupTitle}>
                {LABEL[status]} <span style={styles.count}>({rows.length})</span>
              </h3>
              <ul style={styles.list}>
                {rows.map((row) => (
                  <li key={row.id} style={styles.row}>
                    <div style={styles.rowHead}>
                      <span style={styles.capability}>{row.capability}</span>
                      <Badge variant={blocked ? 'atRisk' : status === 'runtime-enabled' || status === 'live-smoke-tested' ? 'clear' : 'neutral'} appearance="outline">
                        {LABEL[status]}
                      </Badge>
                    </div>
                    <p style={styles.evidence}>{row.evidence}</p>
                    {row.nextAction && <p style={styles.next}><strong>Next:</strong> {row.nextAction}</p>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <CardFooter>
          <span>Code and tests are not live evidence. No deployment, migration, gate flip, communication, funding, or servicing assignment is performed by this report.</span>
        </CardFooter>
      </Card>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  summary: { margin: `0 0 ${spacing.lg}`, color: palette.blockedFg, fontWeight: typography.weight.semibold },
  group: { marginTop: spacing.lg },
  groupTitle: { margin: `0 0 ${spacing.sm}`, fontSize: typography.size.md, color: palette.text },
  count: { color: palette.textMuted, fontWeight: typography.weight.regular },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: spacing.sm },
  row: { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: spacing.md, background: palette.surfaceAlt },
  rowHead: { display: 'flex', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'flex-start' },
  capability: { color: palette.text, fontWeight: typography.weight.semibold },
  evidence: { margin: `${spacing.xs} 0 0`, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  next: { margin: `${spacing.xs} 0 0`, color: palette.text, fontSize: typography.size.sm },
};
