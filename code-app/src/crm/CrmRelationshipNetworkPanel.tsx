import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { CrmRelationshipNetworkSnapshot } from '../shared/crm/deriveCrmRelationshipNetworkSnapshot';

interface Props {
  snapshot: CrmRelationshipNetworkSnapshot;
}

/** Phase 141B-H — read-only CRM relationship network panel (org rollups + gaps). */
export function CrmRelationshipNetworkPanel({ snapshot }: Props) {
  return (
    <Card>
      <CardHeader
        title="Relationship network"
        subtitle={`${snapshot.totalOrganizations} org(s) · ${snapshot.totalPeople} person(s) · ${snapshot.totalRelationships} relationship(s)`}
      />
      <div style={gapRowStyle}>
        <Gap label="Orgs missing contact" value={snapshot.orgsMissingContact} bad={snapshot.orgsMissingContact > 0} />
        <Gap label="Do-not-contact people" value={snapshot.peopleDoNotContact} />
        <Gap label="Authorization gaps" value={snapshot.authorizationGaps} bad={snapshot.authorizationGaps > 0} />
        <Gap label="Contact points" value={snapshot.totalContactPoints} />
      </div>
      {snapshot.orgRollups.length === 0 ? (
        <p style={emptyStyle}>No organizations in CRM.</p>
      ) : (
        <div role="table" aria-label="CRM organizations" style={tableStyle}>
          <div role="row" style={headerRowStyle}>
            {['Organization', 'Type', 'People', 'Contacts', 'Relationships', 'Usable contact', 'Do-not-contact'].map((c) => (
              <span role="columnheader" key={c} style={headerCellStyle}>{c}</span>
            ))}
          </div>
          {snapshot.orgRollups.map((r) => (
            <div role="row" key={r.orgId} style={rowStyle}>
              <span style={cellStyle}>{r.legalName ?? 'Not set'}</span>
              <span style={cellStyle}>{r.orgType}</span>
              <span style={cellStyle}>{r.peopleCount}</span>
              <span style={cellStyle}>{r.contactPointCount}</span>
              <span style={cellStyle}>{r.relationshipCount}</span>
              <span style={r.hasUsableContact ? okStyle : badStyle}>{r.hasUsableContact ? 'Yes' : 'No'}</span>
              <span style={cellStyle}>{r.doNotContactPeople}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Gap({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div style={gapStyle}>
      <span style={bad ? badValueStyle : valueStyle}>{value}</span>
      <span style={gapLabelStyle}>{label}</span>
    </div>
  );
}

const gapRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: spacing.lg, marginBottom: spacing.sm };
const gapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 };
const valueStyle: CSSProperties = { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: palette.text };
const badValueStyle: CSSProperties = { ...valueStyle, color: palette.blockedFg };
const gapLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const tableStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, overflowX: 'auto' };
const headerRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, paddingBottom: spacing.xs };
const headerCellStyle: CSSProperties = { flex: '1 0 100px', fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, padding: `${spacing.xs} 0`, borderTop: `1px solid ${palette.border}` };
const cellStyle: CSSProperties = { flex: '1 0 100px', fontSize: typography.size.sm, color: palette.text };
const okStyle: CSSProperties = { ...cellStyle, color: palette.clearFg, fontWeight: typography.weight.semibold };
const badStyle: CSSProperties = { ...cellStyle, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
