import { type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  deriveReleaseGovernanceSnapshot,
  type LaunchDomainStatus,
  type LaunchReadinessDomain,
} from './releaseGovernanceSnapshot';

/**
 * Phase 197 — Full System Launch Readiness console (READ-ONLY).
 *
 * Renders one honest admin/operator view of whether the entire OGB LOS is ready
 * for V1 launch. It is a pure projection of `deriveReleaseGovernanceSnapshot()`.
 * It performs NO action: no create / write / apply / enable / send, no borrower
 * communication, no gate flip, no SDK call. It only reports the current
 * fail-closed posture. Not route-mounted (no entitlement/route widening).
 */

const STATUS_SEVERITY: Record<LaunchDomainStatus, SeverityKey> = {
  ready: 'clear',
  conditional: 'atRisk',
  blocked: 'blocked',
};

const STATUS_LABEL: Record<LaunchDomainStatus, string> = {
  ready: 'Ready',
  conditional: 'Conditional',
  blocked: 'Blocked',
};

const STANDING_SAFETY_LINES: readonly string[] = [
  'No live gate is flipped by this console.',
  'CRM writeback remains gated.',
  'Workflow writes remain gated.',
  'Borrower communications remain disabled.',
  'Checklist generation remains disabled.',
];

export function FullSystemLaunchReadinessConsole() {
  const readiness = deriveReleaseGovernanceSnapshot();
  return (
    <section style={styles.wrap} aria-label="V1 Full System Launch Readiness" data-full-system-launch-readiness>
      <header style={styles.head}>
        <h2 style={styles.title}>V1 Full System Launch Readiness</h2>
        <div style={styles.recRow}>
          <span style={styles.recLabel}>Overall recommendation:</span>
          <Badge variant="atRisk">{readiness.label}</Badge>
        </div>
        <p style={styles.summary}>{readiness.summary}</p>
      </header>

      <ul style={styles.standingList} aria-label="Standing safety posture">
        {STANDING_SAFETY_LINES.map((line) => (
          <li key={line} style={styles.standingItem}>
            {line}
          </li>
        ))}
      </ul>

      <div style={styles.domains}>
        {readiness.domains.map((d) => (
          <DomainCard key={d.id} domain={d} />
        ))}
      </div>
    </section>
  );
}

function DomainCard({ domain }: { domain: LaunchReadinessDomain }) {
  return (
    <article style={styles.card} data-launch-domain={domain.id}>
      <div style={styles.cardHead}>
        <h3 style={styles.cardTitle}>{domain.label}</h3>
        <Badge variant={STATUS_SEVERITY[domain.status]}>{STATUS_LABEL[domain.status]}</Badge>
      </div>
      <Section title="Details" items={domain.details} />
      {domain.requiredActions.length > 0 && (
        <Section title="Required actions" items={domain.requiredActions} />
      )}
      {domain.safetyNotes.length > 0 && (
        <Section title="Safety notes" items={domain.safetyNotes} />
      )}
    </article>
  );
}

function Section({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>{title}</div>
      <ul style={styles.list}>
        {items.map((it, i) => (
          <li key={i} style={styles.listItem}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder ?? palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
  },
  head: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  recRow: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  recLabel: { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold },
  summary: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
  standingList: {
    margin: 0,
    padding: `${spacing.sm} ${spacing.md}`,
    listStyle: 'disc',
    paddingLeft: spacing.lg,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  standingItem: { fontSize: typography.size.sm, color: palette.text },
  domains: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider ?? palette.border}`,
    borderRadius: radius.sm,
  },
  cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { margin: 0, fontSize: typography.size.base, fontWeight: typography.weight.semibold, color: palette.text },
  section: { display: 'flex', flexDirection: 'column', gap: 2 },
  sectionLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  list: { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 },
  listItem: { fontSize: typography.size.sm, color: palette.text, lineHeight: typography.lineHeight.snug },
};
