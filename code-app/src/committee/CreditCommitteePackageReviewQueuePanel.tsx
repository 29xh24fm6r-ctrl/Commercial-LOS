import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type {
  CreditCommitteePackageQueueResult,
  CreditCommitteePackageRow,
} from './creditCommitteePackageQueue';

interface Props {
  queue: CreditCommitteePackageQueueResult;
  /** Optional builder for an EXISTING internal deal-detail route. No new route is created. */
  dealHrefFor?: (dealId: string) => string;
}

/**
 * Phase 142M — Credit committee package review queue panel (read-only).
 *
 * Shows which credit committee packages are ready for HUMAN review, the evidence
 * present/missing, and the remaining blockers. It is review-only: there is NO
 * vote / approve / deny / recommend / decision affordance, NO "committee-approved"
 * copy, NO state mutation, NO fetch, and NO write. Honest empty / unavailable
 * states are rendered; no sample data is ever shown.
 *
 * (File name intentionally differs in case from the deriver `creditCommitteePackageQueue.ts`
 * to avoid case-insensitive module-resolution collisions on Windows.)
 */
export function CreditCommitteePackageReviewQueuePanel({ queue, dealHrefFor }: Props) {
  if (!queue.available) {
    return (
      <Card>
        <CardHeader title="Credit Committee Package Review Queue" subtitle="Review only — no voting or approvals" />
        <div style={unavailableStyle}>Credit committee package data is unavailable. Nothing is shown until authorized package data is provided.</div>
        <CardFooter>
          <span>Read-only review surface — no voting, approvals, or state changes occur here.</span>
        </CardFooter>
      </Card>
    );
  }

  const { rows, totals } = queue;

  return (
    <Card>
      <CardHeader title="Credit Committee Package Review Queue" subtitle="Review only — no voting or approvals" />

      <div style={bannerStyle}>
        Read-only readiness summary for human committee review. No voting, approval, denial, recommendation, or decision is recorded here, and no deal state is changed.
      </div>

      <div style={kpiStripStyle}>
        <Kpi label="Total packages" value={totals.total} />
        <Kpi label="Ready for review" value={totals.readyForReview} />
        <Kpi label="Blocked" value={totals.blocked} tone="blocked" />
        <Kpi label="Needs evidence" value={totals.needsEvidence} tone="atRisk" />
        <Kpi label="Not generated / unknown" value={totals.notGeneratedOrUnknown} />
      </div>

      {rows.length === 0 ? (
        <div style={emptyStyle}>No committee packages available for review yet.</div>
      ) : (
        <div style={listStyle}>
          {rows.map((row) => (
            <PackageRow key={row.dealId} row={row} href={dealHrefFor?.(row.dealId)} />
          ))}
        </div>
      )}

      <CardFooter>
        <span>Read-only review queue — readiness is decision support for a human committee only; no vote, approval, or denial is implied or recorded.</span>
      </CardFooter>
    </Card>
  );
}

function PackageRow({ row, href }: { row: CreditCommitteePackageRow; href?: string }) {
  return (
    <details style={rowStyle}>
      <summary style={summaryStyle}>
        <span style={dealStyle}>
          {href ? <a href={href} style={linkStyle}>{row.dealName}</a> : row.dealName}
        </span>
        <span style={metaChipStyle}>{row.clientName}</span>
        <span style={metaChipStyle}>{row.bankerName}</span>
        <span style={statusChipStyle(row.readinessStatus)}>{row.readinessLabel}</span>
      </summary>

      <dl style={metaListStyle}>
        <Row label="Readiness" value={row.readinessLabel} />
        <Row label="Evidence" value={row.evidenceCount === undefined ? 'unavailable' : String(row.evidenceCount)} />
        <Row label="Missing evidence" value={String(row.missingEvidenceCount)} />
        <Row label="Blockers" value={String(row.remainingBlockerCount)} />
        <Row label="Decision support" value={row.decisionSupportCount === undefined ? 'unavailable' : String(row.decisionSupportCount)} />
        {row.highConfidenceSupportCount !== undefined && <Row label="High-confidence support" value={String(row.highConfidenceSupportCount)} />}
        <Row label="Stale package" value={String(row.stalePackage)} />
        <Row label="Next human review step" value={row.nextHumanReviewStep} />
      </dl>

      {row.missingEvidenceLabels.length > 0 && (
        <Section title="Missing evidence">
          <ul style={ulStyle}>
            {row.missingEvidenceLabels.map((label) => (
              <li key={label} style={warnItemStyle}>{label}</li>
            ))}
          </ul>
        </Section>
      )}

      {row.honestWarnings.length > 0 && (
        <Section title="Honest warnings">
          <ul style={ulStyle}>
            {row.honestWarnings.map((w) => (
              <li key={w} style={warnItemStyle}>{w}</li>
            ))}
          </ul>
        </Section>
      )}
    </details>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'blocked' | 'atRisk' }) {
  const color = tone === 'blocked' ? palette.blockedFg : tone === 'atRisk' ? palette.atRiskFg : palette.text;
  return (
    <div style={kpiTileStyle}>
      <span style={{ ...kpiValueStyle, color }}>{value}</span>
      <span style={kpiLabelStyle}>{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={sectionStyle}>
      <span style={sectionTitleStyle}>{title}</span>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={dlRowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

function statusChipStyle(status: CreditCommitteePackageRow['readinessStatus']): CSSProperties {
  const color = status === 'blocked' ? palette.blockedFg : status === 'needs_evidence' ? palette.atRiskFg : status === 'ready_for_review' ? palette.clearFg : palette.textMuted;
  return { fontSize: typography.size.xs, color, fontWeight: typography.weight.semibold };
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const unavailableStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.sm };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.sm };
const kpiStripStyle: CSSProperties = { display: 'flex', gap: spacing.md, flexWrap: 'wrap' };
const kpiTileStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 };
const kpiValueStyle: CSSProperties = { fontSize: typography.size.xl, fontWeight: typography.weight.semibold };
const kpiLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label };
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const rowStyle: CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 4, padding: spacing.xs };
const summaryStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', cursor: 'pointer', flexWrap: 'wrap' };
const dealStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const linkStyle: CSSProperties = { color: palette.link, textDecoration: 'none' };
const metaChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const metaListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: `${spacing.xs} 0` };
const dlRowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 180, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.xs };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const warnItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg };
