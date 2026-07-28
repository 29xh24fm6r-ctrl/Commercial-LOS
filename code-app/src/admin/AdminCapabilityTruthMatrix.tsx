import { useMemo, useState } from 'react';
import {
  GOVERNED_WRITES,
  NOT_WIRED,
  LOCAL_ONLY_FLOWS,
  DELIBERATELY_BLOCKED,
  type NotWiredBlockerKind,
} from '../shared/governance/platformInventory';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles } from './adminCardChrome';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Authoritative operator-facing classification of the four mutually
 * exclusive platform capability inventories. PR E retires the competing
 * legacy readiness projections from AdminWorkspace so this remains the
 * canonical answer to what is governed, local, blocked, or not wired.
 */

type MatrixKind = 'governed-write' | 'not-wired' | 'local-only' | 'deliberately-blocked';

interface MatrixRow {
  readonly kind: MatrixKind;
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly blockerKind?: NotWiredBlockerKind;
}

const KIND_LABEL: Record<MatrixKind, string> = {
  'governed-write': 'Live governed write',
  'not-wired': 'Not wired',
  'local-only': 'Local-only (no live persistence)',
  'deliberately-blocked': 'Deliberately blocked',
};

const KIND_TONE: Record<MatrixKind, SeverityKey> = {
  'governed-write': 'clear',
  'not-wired': 'atRisk',
  'local-only': 'neutral',
  'deliberately-blocked': 'blocked',
};

function buildRows(): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const w of GOVERNED_WRITES) {
    rows.push({
      kind: 'governed-write',
      id: w.id,
      label: w.label,
      detail: `Audit history: ${w.emitsAudit ? 'recorded' : 'not recorded'}. Deal timeline: ${w.emitsTimeline ? 'recorded' : 'not applicable'}.`,
    });
  }
  for (const n of NOT_WIRED) {
    rows.push({ kind: 'not-wired', id: n.id, label: n.label, detail: n.reason, blockerKind: n.blockerKind });
  }
  for (const l of LOCAL_ONLY_FLOWS) {
    rows.push({ kind: 'local-only', id: l.id, label: l.label, detail: l.note });
  }
  for (const b of DELIBERATELY_BLOCKED) {
    rows.push({ kind: 'deliberately-blocked', id: b.id, label: b.label, detail: b.reason });
  }
  return rows;
}

const ALL_ROWS = buildRows();
const KIND_FILTERS: readonly (MatrixKind | 'all')[] = ['all', 'governed-write', 'not-wired', 'local-only', 'deliberately-blocked'];

export function AdminCapabilityTruthMatrix() {
  const [filter, setFilter] = useState<MatrixKind | 'all'>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_ROWS.filter((r) => (filter === 'all' || r.kind === filter) && (q.length === 0 || r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));
  }, [filter, query]);

  const counts = useMemo(() => {
    const c: Record<MatrixKind, number> = { 'governed-write': 0, 'not-wired': 0, 'local-only': 0, 'deliberately-blocked': 0 };
    for (const r of ALL_ROWS) c[r.kind] += 1;
    return c;
  }, []);

  return (
    <Card>
      <CardHeader title="Capability Truth Matrix" subtitle={`${ALL_ROWS.length} tracked capabilities across ${GOVERNED_WRITES.length} live writes, ${NOT_WIRED.length} not-wired, ${LOCAL_ONLY_FLOWS.length} local-only, ${DELIBERATELY_BLOCKED.length} deliberately blocked`} />
      <div style={styles.controls}>
        <input
          style={styles.search}
          placeholder="Search by label or id…"
          value={query}
          data-admin-truth-matrix-search
          onChange={(e) => setQuery(e.target.value)}
        />
        <div style={styles.filterRow} role="group" aria-label="Filter by capability kind">
          {KIND_FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              style={filter === k ? styles.filterBtnActive : styles.filterBtn}
              data-admin-truth-matrix-filter={k}
              onClick={() => setFilter(k)}
            >
              {k === 'all' ? `All (${ALL_ROWS.length})` : `${KIND_LABEL[k]} (${counts[k]})`}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p style={adminStyles.muted}>No capabilities match this filter.</p>
      ) : (
        <ul style={adminStyles.list} data-admin-truth-matrix-rows>
          {rows.map((r) => (
            <li key={`${r.kind}:${r.id}`} style={adminStyles.row} data-admin-truth-matrix-row={r.id}>
              <div style={adminStyles.rowHead}>
                <span style={adminStyles.rowTitle}>{r.label}</span>
                <div style={styles.badgeGroup}>
                  {r.blockerKind && <Badge variant="neutral" appearance="outline">{r.blockerKind}</Badge>}
                  <Badge variant={KIND_TONE[r.kind]} appearance="outline">{KIND_LABEL[r.kind]}</Badge>
                </div>
              </div>
              <p style={styles.detail}>{r.detail}</p>
            </li>
          ))}
        </ul>
      )}
      <CardFooter>
        <span>One mutually exclusive inventory: each capability is classified once as governed, unavailable, local-only, or intentionally blocked.</span>
      </CardFooter>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  controls: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  search: { padding: `${spacing.xs} ${spacing.md}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs },
  filterBtn: { background: palette.surfaceAlt, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.xs, cursor: 'pointer' },
  filterBtnActive: { background: palette.accent, color: '#fffdf9', border: `1px solid ${palette.accent}`, borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.xs, cursor: 'pointer', fontWeight: typography.weight.semibold },
  badgeGroup: { display: 'flex', gap: spacing.xxs, flexShrink: 0 },
  detail: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
};
