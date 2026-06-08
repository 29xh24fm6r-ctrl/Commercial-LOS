import { useMemo, type CSSProperties } from 'react';
import { spacing, typography, palette } from '../shared/theme';
import type { CrmMaster } from '../shared/crm/crmTypes';
import { deriveCrmRelationshipNetworkSnapshot } from '../shared/crm/deriveCrmRelationshipNetworkSnapshot';
import { CrmRelationshipNetworkPanel } from './CrmRelationshipNetworkPanel';
import { CrmContactTaskBoard } from './CrmContactTaskBoard';

interface Props {
  /** Authorized, already-loaded CRM master. Defaults to empty. */
  master?: CrmMaster;
  asOfDate?: string | Date;
}

const EMPTY: CrmMaster = {
  organizations: [],
  people: [],
  contactPoints: [],
  relationships: [],
  roleAssignments: [],
  communicationPreferences: [],
  contactAuthorizations: [],
  timeline: [],
  audit: [],
};

/**
 * Phase 141B-H — CRM relationship master command center. Read-only: pure
 * derivation from authorized data, no data loading, no write affordance, honest
 * empty states. No borrower outreach is performed here.
 */
export function CrmRelationshipCommandCenter({ master = EMPTY, asOfDate }: Props) {
  const snapshot = useMemo(() => deriveCrmRelationshipNetworkSnapshot(master), [master]);

  return (
    <section style={pageStyle} aria-label="CRM Relationship Master">
      <header style={headerStyle}>
        <h1 style={titleStyle}>CRM Relationship Master</h1>
        <p style={subtitleStyle}>
          Organizations, people, contact points, relationships, and authorizations — read-only.
          No outreach is sent from this surface.
        </p>
      </header>
      <CrmRelationshipNetworkPanel snapshot={snapshot} />
      <CrmContactTaskBoard master={master} asOfDate={asOfDate} />
    </section>
  );
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg, padding: spacing.lg };
const headerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const titleStyle: CSSProperties = { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text };
const subtitleStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle };
