import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AdminConfigurationReviewQueue } from './adminConfigurationTypes';
import type { AdminConfigurationPersistenceSummary } from './AdminConfigurationReviewQueuePanel';

interface Props {
  queue: AdminConfigurationReviewQueue;
  persistence?: AdminConfigurationPersistenceSummary;
}

/**
 * Phase 142G — Admin configuration summary panel (read-only).
 *
 * High-level dashboard of proposed configuration changes: pending, blocked,
 * approved-not-applied, rejected, risk distribution, and target-domain
 * distribution. Read-only — no apply / mutate / route registration / fetch /
 * write affordance, and no fabricated data.
 */
export function AdminConfigurationSummaryPanel({ queue, persistence }: Props) {
  const riskDistribution = countBy(queue.proposals.map((e) => e.proposal.riskClass));
  const domainDistribution = countBy(queue.proposals.map((e) => e.proposal.targetDomain));

  return (
    <Card>
      <CardHeader title="Admin configuration summary" subtitle="Proposed configuration changes — review-only" />

      <div style={bannerStyle}>
        Read-only governance summary — no configuration is applied, deployed, published, or activated in this phase.
      </div>

      <div style={countsStyle}>
        <Count label="Pending" value={queue.pendingCount} />
        <Count label="Blocked unsafe" value={queue.blockedCount} tone="blocked" />
        <Count label="Approved (not applied)" value={queue.approvedNotAppliedCount} />
        <Count label="Rejected" value={queue.rejectedCount} />
        <Count label="High risk" value={queue.highRiskCount} tone="blocked" />
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Risk distribution</span>
        <ul style={ulStyle}>
          {riskDistribution.map(([k, v]) => (
            <li key={k} style={itemStyle}>{k.replace(/_/g, ' ')}: {v}</li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Target domain distribution</span>
        <ul style={ulStyle}>
          {domainDistribution.map(([k, v]) => (
            <li key={k} style={itemStyle}>{k.replace(/_/g, ' ')}: {v}</li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Next best actions</span>
        <ul style={ulStyle}>
          <li style={itemStyle}>Review pending proposals and acknowledge blocked-unsafe items (no apply).</li>
          {queue.approvedNotAppliedCount > 0 && <li style={itemStyle}>Track approved-not-applied proposals for a future implementation phase.</li>}
        </ul>
      </div>

      {persistence && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Persistence readiness (142J)</span>
          <span style={itemStyle}>Mode: {persistence.persistenceMode ?? 'disabled'} · Schema: {persistence.schemaStatus ?? 'not ready'}</span>
        </div>
      )}

      <CardFooter>
        <span>Governed review summary only — proposals are never applied, deployed, or activated in this phase.</span>
      </CardFooter>
    </Card>
  );
}

function countBy(values: readonly string[]): ReadonlyArray<readonly [string, number]> {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'blocked' }) {
  return (
    <div style={countTileStyle}>
      <span style={tone === 'blocked' ? countValueBlockedStyle : countValueStyle}>{value}</span>
      <span style={countLabelStyle}>{label}</span>
    </div>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const countsStyle: CSSProperties = { display: 'flex', gap: spacing.md, flexWrap: 'wrap' };
const countTileStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 };
const countValueStyle: CSSProperties = { fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text };
const countValueBlockedStyle: CSSProperties = { ...countValueStyle, color: palette.blockedFg };
const countLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
