import { Badge, EmptyState } from '../../design';
import { palette, radius, spacing, typography } from '../../shared/theme';
import type { AdvisorLink } from '../advisors/advisorViewModel';

/** Advisors attached to a client (and, where scoped, a deal). */
export function AdvisorsOnClientPanel({ advisors, clientName }: { advisors: readonly AdvisorLink[]; clientName?: string }) {
  if (advisors.length === 0) {
    return (
      <EmptyState
        title="No advisors linked yet"
        body={`Add the CPA, attorney, CDC, or appraiser who works with ${clientName ?? 'this client'} to build the relationship file.`}
      />
    );
  }
  return (
    <ul style={styles.list}>
      {advisors.map((a, i) => (
        <li key={`${a.advisorOrgId}-${a.role}-${i}`} style={styles.row} data-advisor-link>
          <div style={styles.main}>
            <span style={styles.name}>{a.advisorName}</span>
            <Badge tone="info">{a.role}</Badge>
          </div>
          {a.dealId && <span style={styles.deal}>on deal {a.dealName ?? a.dealId}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Reverse — the clients (and deals) a given advisor touches. */
export function AdvisorReachPanel({ links, advisorName }: { links: readonly AdvisorLink[]; advisorName?: string }) {
  if (links.length === 0) {
    return (
      <EmptyState
        title="No linked clients yet"
        body={`Once ${advisorName ?? 'this advisor'} is linked to clients or deals, every relationship they touch shows here.`}
      />
    );
  }
  return (
    <ul style={styles.list}>
      {links.map((l, i) => (
        <li key={`${l.clientOrgId}-${l.dealId ?? ''}-${i}`} style={styles.row} data-advisor-reach>
          <div style={styles.main}>
            <span style={styles.name}>{l.clientName}</span>
            <Badge tone="neutral">{l.role}</Badge>
          </div>
          {l.dealId && <span style={styles.deal}>deal {l.dealName ?? l.dealId}</span>}
        </li>
      ))}
    </ul>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.md, background: palette.surface },
  main: { display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  name: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text },
  deal: { fontSize: typography.size.xs, color: palette.textSubtle, whiteSpace: 'nowrap' },
};
