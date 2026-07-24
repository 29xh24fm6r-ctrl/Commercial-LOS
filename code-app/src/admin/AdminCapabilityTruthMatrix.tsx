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
 * PR 108 -- Admin Capability Truth Matrix.
 *
 * The Phase 0 baseline survey found several overlapping "is this feature
 * live" panels already in AdminWorkspace.tsx (ReleaseReadinessGate,
 * V1GoLiveReleaseCertificationPanel, FullSystemActivationLaunchPanel,
 * EliteCrmLosActivationReadinessPanel, OgbCrmWorkflowActivationPanel,
 * V1ActivationReadinessPanel, FullSystemLaunchReadinessConsole), each
 * independently projecting capability state from platformInventory.ts with
 * no single canonical view tying them together. Retiring or merging any of
 * those existing, individually-certified panels is a real product/
 * compliance decision this PR does not make -- they are release-candidate
 * certification surfaces, not casually replaceable.
 *
 * This is ADDITIVE instead: one new panel reading the SAME four
 * platformInventory.ts registries every other panel already derives from
 * (GOVERNED_WRITES, NOT_WIRED, LOCAL_ONLY_FLOWS, DELIBERATELY_BLOCKED),
 * shown together in one place with filtering, so an admin doesn't have to
 * cross-reference six panels to answer "what exactly is live vs.
 * schema-blocked vs. connector-blocked vs. a deliberate non-goal." No
 * existing panel is touched, removed, or reinterpreted.
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
      detail: `Phase ${w.phase} -- emits audit: ${w.emitsAudit ? 'yes' : 'no'}, emits timeline: ${w.emitsTimeline ? 'yes' : 'no'}.`,
    });
  }
  for (const n of NOT_WIRED) {
    rows.push({ kind: 'not-wired', id: n.id, label: n.label, detail: n.reason, blockerKind: n.blockerKind });
  }
  for (const l of LOCAL_ONLY_FLOWS) {
    rows.push({ kind: 'local-only', id: l.id, label: l.label, detail: `Phase ${l.phase} -- ${l.note}` });
  }
  for (const b of DELIBERATELY_BLOCKED) {
    rows.push({ kind: 'deliberately-blocked', id: b.id, label: b.label, detail: `Phase ${b.phase} -- ${b.reason}` });
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
        <span>Sourced live from shared/governance/platformInventory.ts -- the same registries every other admin readiness panel reads from. This view does not replace them; it cross-references all four in one place.</span>
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
