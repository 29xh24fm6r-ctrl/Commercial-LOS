import { useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PlatformObjectCatalogItem } from './platformSurfaceTypes';

interface Props {
  objects: readonly PlatformObjectCatalogItem[];
}

/**
 * Phase 142B — Platform object catalog panel (read-only).
 *
 * Shows governed platform objects: owner, source, read/write model, allowed +
 * forbidden actions, relationship/view counts, and policy chips. Controls are
 * local search only — there is NO create / edit / add-field / mutate-schema /
 * enable-write / generate-route / connect-external / fetch affordance.
 */
export function PlatformObjectCatalogPanel({ objects }: Props) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = q
    ? objects.filter((o) => `${o.displayName} ${o.domain} ${o.ownerWorkspace}`.toLowerCase().includes(q))
    : objects;

  return (
    <Card>
      <CardHeader title="Platform object catalog" subtitle={`${objects.length} governed objects (read-only)`} />

      <input
        aria-label="Search objects"
        placeholder="Search objects by name / domain / workspace"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
      />

      {shown.length === 0 ? (
        <span style={noneStyle}>No objects match.</span>
      ) : (
        <ul style={listStyle}>
          {shown.map((o) => (
            <li key={o.objectKey} style={itemStyle}>
              <span style={nameStyle}>{o.displayName}</span>
              <span style={metaStyle}>
                {o.domain} · {o.ownerWorkspace} · {o.sourceTable ?? o.sourceModule} · {o.status.replace(/_/g, ' ')}
              </span>
              <span style={chipsStyle}>
                PII: {o.piiPolicy} · audit: {o.auditPolicy} · evidence: {o.evidencePolicy} · {o.relationshipCount} rel · {o.viewCount} views
              </span>
              <span style={metaStyle}>Allowed: {o.allowedActions.join(', ')}</span>
              <span style={forbiddenStyle}>Forbidden: {o.forbiddenActions.join(', ')}</span>
              {o.caveats.map((c) => (
                <span key={c} style={caveatStyle}>{c}</span>
              ))}
            </li>
          ))}
        </ul>
      )}

      <CardFooter>
        <span>Metadata only — no object creation, schema mutation, or writes occur here.</span>
      </CardFooter>
    </Card>
  );
}

const searchStyle: CSSProperties = { width: '100%', padding: spacing.xs, fontSize: typography.size.sm, marginBottom: spacing.sm, boxSizing: 'border-box' };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm };
const itemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, borderBottom: `1px solid ${palette.border}`, paddingBottom: spacing.xs };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const chipsStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const forbiddenStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg };
const caveatStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRiskFg, fontStyle: 'italic' };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
