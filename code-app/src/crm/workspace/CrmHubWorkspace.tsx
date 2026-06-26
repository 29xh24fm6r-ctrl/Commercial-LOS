import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Badge } from '../../shared/Badge';
import { palette, radius, shadow, spacing, typography } from '../../shared/theme';
import {
  CRM_DOMAINS,
  loadCrmWorkspaceData,
  type CrmDomainKey,
  type CrmRecord,
  type CrmWorkspaceData,
} from './crmWorkspaceData';

/**
 * Phase 258 — CRM Hub workspace.
 *
 * A real bank-user CRM system: live records from the 10 internal CRM tables,
 * dashboard count cards, per-domain lists, a record detail drawer, and an
 * activity timeline. Read-only today (CRM live-write transport is not wired);
 * no fabricated records and honest per-domain unavailable states. Governance /
 * readiness detail lives in Admin Diagnostics, not here.
 */

interface Props {
  /** Injected for tests; defaults to the live CRM read. */
  loadData?: () => Promise<CrmWorkspaceData>;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: CrmWorkspaceData }
  | { kind: 'failed'; message: string };

export function CrmHubWorkspace({ loadData = loadCrmWorkspaceData }: Props = {}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [domain, setDomain] = useState<CrmDomainKey>('organizations');
  const [selected, setSelected] = useState<CrmRecord | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadData()
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const activeSpec = useMemo(() => CRM_DOMAINS.find((d) => d.key === domain)!, [domain]);
  const activeResult = state.kind === 'ready' ? state.data[domain] : undefined;

  return (
    <section style={styles.wrap} aria-label="CRM" data-crm-hub="workspace">
      <header style={styles.head}>
        <h2 style={styles.title}>CRM</h2>
        <p style={styles.subtitle}>
          Your relationship records — organizations, people, relationships,
          vendors, and activity.
        </p>
      </header>

      {state.kind === 'loading' && <div style={styles.muted}>Loading CRM records…</div>}
      {state.kind === 'failed' && (
        <div style={styles.failNote} role="alert" data-crm-hub-failure>
          CRM is not available right now. {state.message} Refresh to retry.
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <div style={styles.cardGrid} data-crm-cards>
            {CRM_DOMAINS.map((d) => {
              const res = state.data[d.key];
              const count = res.status === 'ready' ? res.records.length : undefined;
              const active = d.key === domain;
              return (
                <button
                  key={d.key}
                  type="button"
                  style={active ? styles.cardActive : styles.card}
                  data-crm-card={d.key}
                  aria-pressed={active}
                  onClick={() => {
                    setDomain(d.key);
                    setSelected(undefined);
                  }}
                >
                  <span style={styles.cardLabel}>{d.label}</span>
                  <span style={styles.cardValue}>
                    {res.status === 'failed' ? '—' : count}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={styles.body}>
            <DomainList
              spec={activeSpec}
              result={activeResult}
              selectedId={selected?.id}
              onOpen={setSelected}
            />
            {selected && (
              <DetailDrawer record={selected} domainLabel={activeSpec.singular} onClose={() => setSelected(undefined)} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function DomainList({
  spec,
  result,
  selectedId,
  onOpen,
}: {
  spec: (typeof CRM_DOMAINS)[number];
  result: CrmWorkspaceData[CrmDomainKey] | undefined;
  selectedId: string | undefined;
  onOpen: (r: CrmRecord) => void;
}) {
  return (
    <div style={styles.listWrap} data-crm-list={spec.key} aria-label={`${spec.label} records`}>
      <div style={styles.listHeader}>{spec.label}</div>
      {!result || result.status === 'failed' ? (
        <div style={styles.muted} data-crm-list-unavailable>
          {spec.label} are not available right now.
        </div>
      ) : result.records.length === 0 ? (
        <div style={styles.muted}>No {spec.singular} records yet.</div>
      ) : (
        <ul style={styles.recordList}>
          {result.records.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                style={r.id === selectedId ? styles.recordRowActive : styles.recordRow}
                data-crm-record={r.id}
                onClick={() => onOpen(r)}
              >
                <span style={styles.recordMain}>
                  <span style={styles.recordTitle}>{r.title}</span>
                  {r.subtitle && <span style={styles.recordSubtitle}>{r.subtitle}</span>}
                </span>
                <span style={styles.recordTrail}>
                  {spec.timeline && r.occurredAt && (
                    <span style={styles.recordWhen}>{formatWhen(r.occurredAt)}</span>
                  )}
                  {r.badge && (
                    <Badge variant="neutral" appearance="outline">
                      {r.badge}
                    </Badge>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailDrawer({
  record,
  domainLabel,
  onClose,
}: {
  record: CrmRecord;
  domainLabel: string;
  onClose: () => void;
}) {
  return (
    <aside style={styles.drawer} aria-label={`${domainLabel} detail`} data-crm-detail-drawer role="dialog">
      <div style={styles.drawerHead}>
        <div>
          <div style={styles.drawerTitle}>{record.title}</div>
          {record.subtitle && <div style={styles.drawerSubtitle}>{record.subtitle}</div>}
        </div>
        <button type="button" style={styles.drawerClose} aria-label="Close detail" data-crm-detail-close onClick={onClose}>
          ✕
        </button>
      </div>
      {record.badge && (
        <div style={styles.drawerBadge}>
          <Badge variant="neutral" appearance="outline">
            {record.badge}
          </Badge>
        </div>
      )}
      {record.detail.length === 0 ? (
        <div style={styles.muted}>No additional detail recorded.</div>
      ) : (
        <dl style={styles.detailList}>
          {record.detail.map((d) => (
            <div key={d.label} style={styles.detailRow}>
              <dt style={styles.detailLabel}>{d.label}</dt>
              <dd style={styles.detailValue}>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%' },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.text, letterSpacing: typography.letterSpacing.heading },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  muted: { color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic', padding: `${spacing.md} 0` },
  failNote: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: spacing.sm,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
  },
  cardActive: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.cobaltBg,
    border: `1px solid ${palette.cobalt}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
  },
  cardLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  cardValue: { fontSize: typography.size.xxl, fontWeight: typography.weight.bold, color: palette.text, fontVariantNumeric: 'tabular-nums' },
  body: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: spacing.lg, position: 'relative' },
  listWrap: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: `${spacing.md} ${spacing.lg}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  listHeader: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  recordList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  recordRow: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
  },
  recordRowActive: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.cobaltBg,
    border: `1px solid ${palette.cobalt}`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: typography.family,
  },
  recordMain: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  recordTitle: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text },
  recordSubtitle: { fontSize: typography.size.xs, color: palette.textMuted },
  recordTrail: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  recordWhen: { fontSize: typography.size.xs, color: palette.textSubtle },
  drawer: {
    marginTop: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.elevated,
    padding: `${spacing.md} ${spacing.lg}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  drawerHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  drawerTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  drawerSubtitle: { fontSize: typography.size.sm, color: palette.textMuted },
  drawerClose: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: typography.size.md, color: palette.textMuted, lineHeight: 1 },
  drawerBadge: { display: 'flex' },
  detailList: { margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  detailRow: { display: 'grid', gridTemplateColumns: '160px 1fr', gap: spacing.sm },
  detailLabel: { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold },
  detailValue: { margin: 0, fontSize: typography.size.sm, color: palette.text, wordBreak: 'break-word' },
};
