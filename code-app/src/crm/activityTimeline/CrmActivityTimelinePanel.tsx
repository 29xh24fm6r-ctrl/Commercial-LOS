import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { CrmActivityTimelineResult } from './crmActivityTimelineModel';

interface Props {
  timeline?: CrmActivityTimelineResult;
}

/**
 * Phase 143G — CRM activity timeline panel (read-only).
 *
 * Renders a read-only relationship timeline from local input only. There is NO
 * email send, NO Outlook/Graph, NO Salesforce/nCino lookup, NO write control, and
 * NO fake activity. External references are labels only.
 */
export function CrmActivityTimelinePanel({ timeline }: Props) {
  if (!timeline || timeline.timelineRows.length === 0) {
    return (
      <Card>
        <CardHeader title="CRM Relationship Timeline" subtitle="Read-only — local input only" />
        <div style={emptyStyle}>No relationship timeline events available.</div>
        <CardFooter><span>Read-only timeline — no CRM lookup, email, or external change occurs here.</span></CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="CRM Relationship Timeline" subtitle="Read-only — local input only" />
      <div style={bannerStyle}>
        Read-only timeline assembled from local LOS/CRM-reference input. No email is sent, no Outlook/Graph or Salesforce/nCino lookup occurs, and no external system is changed.
      </div>
      <ul style={listStyle}>
        {timeline.timelineRows.map((row, i) => (
          <li key={i} style={rowStyle}>
            <span style={dateStyle}>{row.occurredAt}</span>
            <span style={itemStyle}>{row.label}</span>
            <span style={row.externalReferenceOnly ? refChipStyle : typeChipStyle}>{row.eventType.replace(/_/g, ' ')}{row.externalReferenceOnly ? ' (reference only)' : ''}</span>
          </li>
        ))}
      </ul>
      <CardFooter><span>Read-only timeline — external CRM events are reference labels only; nothing is fetched or written.</span></CardFooter>
    </Card>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.sm };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing.xs };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${palette.divider}`, paddingBottom: spacing.xs };
const dateStyle: CSSProperties = { minWidth: 90, fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, flex: 1 };
const typeChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const refChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' };
