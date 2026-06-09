import { type CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { derivePlatformObjectCatalog } from './derivePlatformObjectCatalog';
import { derivePlatformViewCatalog } from './derivePlatformViewCatalog';
import { derivePlatformObjectRelationshipMap } from './derivePlatformObjectRelationshipMap';
import { deriveWorkspaceCapabilityGroups } from './deriveWorkspaceCapabilityGroups';
import { deriveCompetitiveImplementationBacklog } from '../competitive/deriveCompetitiveImplementationBacklog';
import { PlatformObjectCatalogPanel } from './PlatformObjectCatalogPanel';
import { PlatformViewCatalogPanel } from './PlatformViewCatalogPanel';
import { PlatformRelationshipMapPanel } from './PlatformRelationshipMapPanel';
import type { PlatformViewerContext } from './platformSurfaceTypes';

/** Optional workflow routing summary (Phase 142C) — passed in by the caller. */
export interface PlatformWorkflowRoutingSummary {
  routeCount?: number;
  creditCommitteeRouteCount?: number;
  annualReviewRouteCount?: number;
  exceptionRouteCount?: number;
  selectedRoutePreview?: string;
}

interface Props {
  context?: PlatformViewerContext;
  workflowRouting?: PlatformWorkflowRoutingSummary;
}

/**
 * Phase 142B — Platform metadata dashboard (read-only).
 *
 * Combines the object catalog, view catalog, relationship map, workspace
 * capability groups, and the Phase 142A backlog into a unified read-only,
 * permission-scoped surface. Metadata only — there is NO schema builder, object/
 * view/custom-field creation, workflow activation, route registration, write
 * toggle, external-integration toggle, or fetch. No new route is registered.
 */
export function PlatformMetadataDashboard({ context, workflowRouting }: Props) {
  const ctx: PlatformViewerContext = context ?? { workspace: 'strategy' };
  const objects = derivePlatformObjectCatalog({ context: ctx });
  const views = derivePlatformViewCatalog({ context: ctx });
  const edges = derivePlatformObjectRelationshipMap({ context: ctx });
  const groups = deriveWorkspaceCapabilityGroups();
  const backlog = deriveCompetitiveImplementationBacklog();

  const readOnlyCount = objects.filter((o) => o.status === 'available_read_only').length;
  const writeGatedCount = objects.filter((o) => o.status === 'available_write_gated').length;

  return (
    <Card>
      <CardHeader title="Platform metadata" subtitle={`Workspace: ${ctx.workspace} · read-only`} />

      <div style={bannerStyle}>
        Metadata only — no schema mutation, object/view creation, custom fields, workflow activation, route registration, or writes occur here.
      </div>

      <dl style={metaStyle}>
        <Row label="Objects" value={String(objects.length)} />
        <Row label="Views" value={String(views.length)} />
        <Row label="Relationship edges" value={String(edges.length)} />
        <Row label="Read-only objects" value={String(readOnlyCount)} />
        <Row label="Write-gated objects" value={String(writeGatedCount)} />
      </dl>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Workspace capability groups</span>
        <ul style={ulStyle}>
          {groups.map((g) => (
            <li key={g.groupKey} style={itemStyle}>
              {g.displayName}: {g.objects.length} objects, {g.views.length} views · shipped {g.shippedCapabilities.length} · planned {g.plannedCapabilities.length}
            </li>
          ))}
        </ul>
      </div>

      {workflowRouting && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Workflow routing (142C)</span>
          <ul style={ulStyle}>
            {workflowRouting.routeCount !== undefined && <li style={itemStyle}>Routes: {workflowRouting.routeCount}</li>}
            {workflowRouting.creditCommitteeRouteCount !== undefined && <li style={itemStyle}>Credit committee routes: {workflowRouting.creditCommitteeRouteCount}</li>}
            {workflowRouting.annualReviewRouteCount !== undefined && <li style={itemStyle}>Annual review routes: {workflowRouting.annualReviewRouteCount}</li>}
            {workflowRouting.exceptionRouteCount !== undefined && <li style={itemStyle}>Exception routes: {workflowRouting.exceptionRouteCount}</li>}
            {workflowRouting.selectedRoutePreview && <li style={itemStyle}>Selected route: {workflowRouting.selectedRoutePreview}</li>}
          </ul>
        </div>
      )}

      <PlatformObjectCatalogPanel objects={objects} />
      <PlatformViewCatalogPanel views={views} />
      <PlatformRelationshipMapPanel edges={edges} />

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Next recommended platform phases</span>
        <ul style={ulStyle}>
          {backlog.recommendedPhases.map((p) => (
            <li key={p} style={itemStyle}>{p}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4, marginBottom: spacing.sm };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
