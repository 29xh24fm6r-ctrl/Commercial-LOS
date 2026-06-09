import { useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PlatformViewCatalogItem } from './platformSurfaceTypes';

interface Props {
  views: readonly PlatformViewCatalogItem[];
}

/**
 * Phase 142B — Platform view catalog panel (read-only).
 *
 * Shows governed platform views: object, workspace, columns, structured filter
 * summary, sort, risk class, permission, and route availability. Controls are
 * local search only — there is NO create / edit / save view, no arbitrary query
 * UI, no column/filter editing, no export, and no fetch.
 */
export function PlatformViewCatalogPanel({ views }: Props) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = q
    ? views.filter((v) => `${v.displayName} ${v.objectKey} ${v.workspace}`.toLowerCase().includes(q))
    : views;

  return (
    <Card>
      <CardHeader title="Platform view catalog" subtitle={`${views.length} governed views (read-only)`} />

      <input
        aria-label="Search views"
        placeholder="Search views by name / object / workspace"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
      />

      {shown.length === 0 ? (
        <span style={noneStyle}>No views match.</span>
      ) : (
        <ul style={listStyle}>
          {shown.map((v) => (
            <li key={v.viewKey} style={itemStyle}>
              <span style={nameStyle}>{v.displayName}</span>
              <span style={metaStyle}>
                {v.objectKey} · {v.workspace} · {v.riskClass} · read-only · {v.status.replace(/_/g, ' ')}
              </span>
              <span style={metaStyle}>Columns: {v.columns.join(', ')}</span>
              <span style={metaStyle}>
                Filters: {v.filters.length === 0 ? 'none' : v.filters.map((f) => `${f.field} ${f.operator}`).join('; ')}
              </span>
              <span style={metaStyle}>Permission: {v.requiresPermission} · route: {v.route ?? 'none'}</span>
              {v.caveats.map((c) => (
                <span key={c} style={caveatStyle}>{c}</span>
              ))}
            </li>
          ))}
        </ul>
      )}

      <CardFooter>
        <span>Read-only views — no view creation, query editing, or export occurs here.</span>
      </CardFooter>
    </Card>
  );
}

const searchStyle: CSSProperties = { width: '100%', padding: spacing.xs, fontSize: typography.size.sm, marginBottom: spacing.sm, boxSizing: 'border-box' };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm };
const itemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, borderBottom: `1px solid ${palette.border}`, paddingBottom: spacing.xs };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const caveatStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRiskFg, fontStyle: 'italic' };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
