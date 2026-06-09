import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PlatformObjectRelationshipEdge } from './platformSurfaceTypes';

interface Props {
  edges: readonly PlatformObjectRelationshipEdge[];
}

/**
 * Phase 142B — Platform relationship map panel (read-only).
 *
 * An accessible list of governed object relationship edges (no external graph
 * library, no canvas-only UI). Hidden targets are shown as "redacted". There is
 * NO create / edit / delete relationship, no lookup creation, no schema
 * mutation, no record-level data, and no fetch.
 */
export function PlatformRelationshipMapPanel({ edges }: Props) {
  return (
    <Card>
      <CardHeader title="Object relationship map" subtitle={`${edges.length} architecture edges (metadata only)`} />

      {edges.length === 0 ? (
        <span style={noneStyle}>No relationship edges visible in this context.</span>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>From</th>
              <th style={thStyle}>To</th>
              <th style={thStyle}>Relationship</th>
              <th style={thStyle}>Type</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e, i) => (
              <tr key={`${e.fromObjectKey}-${e.toObjectKey}-${i}`}>
                <td style={tdStyle}>{e.fromObjectKey}</td>
                <td style={e.visible ? tdStyle : redactedStyle}>{e.visible ? e.toObjectKey : 'redacted'}</td>
                <td style={tdStyle}>{e.label} {e.required ? '(required)' : '(optional)'}</td>
                <td style={tdStyle}>{e.relationshipType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CardFooter>
        <span>Metadata only — no relationship creation, lookup creation, or schema mutation occurs here.</span>
      </CardFooter>
    </Card>
  );
}

const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm };
const thStyle: CSSProperties = { textAlign: 'left', fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, padding: `${spacing.xs} ${spacing.sm} ${spacing.xs} 0`, borderBottom: `1px solid ${palette.border}` };
const tdStyle: CSSProperties = { padding: `${spacing.xs} ${spacing.sm} ${spacing.xs} 0`, color: palette.text, borderBottom: `1px solid ${palette.border}` };
const redactedStyle: CSSProperties = { ...tdStyle, color: palette.textSubtle, fontStyle: 'italic' };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
