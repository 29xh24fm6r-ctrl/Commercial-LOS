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

/** Optional product/process template summary (Phase 142D) — passed in by the caller. */
export interface PlatformProductProcessTemplateSummary {
  totalTemplates?: number;
  activeCount?: number;
  plannedCount?: number;
  disabledCount?: number;
  productFamilies?: readonly string[];
  annualReviewTemplateCount?: number;
  fdicCommitteeTemplateCount?: number;
  selectedTemplatePreview?: string;
}

/** Optional servicing lifecycle summary (Phase 142E) — passed in by the caller. */
export interface PlatformServicingLifecycleSummary {
  lifecycleStage?: string;
  lifecycleHealth?: string;
  servicingExpectationCount?: number;
  blockerCount?: number;
  nextBestAction?: string;
}

/** Optional integration readiness summary (Phase 142F) — passed in by the caller. */
export interface PlatformIntegrationReadinessSummary {
  requiredCount?: number;
  blockedCount?: number;
  missingPolicyApprovals?: number;
  nextBestAction?: string;
}

/** Optional admin configuration review summary (Phase 142G) — passed in by the caller. */
export interface PlatformAdminConfigurationSummary {
  pendingCount?: number;
  blockedUnsafeCount?: number;
  approvedNotAppliedCount?: number;
  highRiskCount?: number;
  nextBestAction?: string;
  /** Phase 142J — optional persistence readiness summary. */
  persistenceMode?: string;
  persistenceSchemaStatus?: string;
  /** Phase 142K — optional controlled-apply workflow summary. */
  applyPreviewReadyCount?: number;
  applyBlockedCount?: number;
  applyDryRunOnly?: boolean;
}

interface Props {
  context?: PlatformViewerContext;
  workflowRouting?: PlatformWorkflowRoutingSummary;
  productProcessTemplates?: PlatformProductProcessTemplateSummary;
  servicing?: PlatformServicingLifecycleSummary;
  integration?: PlatformIntegrationReadinessSummary;
  adminConfiguration?: PlatformAdminConfigurationSummary;
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
export function PlatformMetadataDashboard({ context, workflowRouting, productProcessTemplates, servicing, integration, adminConfiguration }: Props) {
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

      {productProcessTemplates && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Product / process templates (142D)</span>
          <ul style={ulStyle}>
            {productProcessTemplates.totalTemplates !== undefined && <li style={itemStyle}>Templates: {productProcessTemplates.totalTemplates}</li>}
            {productProcessTemplates.activeCount !== undefined && <li style={itemStyle}>Active: {productProcessTemplates.activeCount} · Planned: {productProcessTemplates.plannedCount ?? 0} · Disabled: {productProcessTemplates.disabledCount ?? 0}</li>}
            {productProcessTemplates.productFamilies && <li style={itemStyle}>Families: {productProcessTemplates.productFamilies.join(', ')}</li>}
            {productProcessTemplates.annualReviewTemplateCount !== undefined && <li style={itemStyle}>Annual review templates: {productProcessTemplates.annualReviewTemplateCount}</li>}
            {productProcessTemplates.fdicCommitteeTemplateCount !== undefined && <li style={itemStyle}>FDIC / committee templates: {productProcessTemplates.fdicCommitteeTemplateCount}</li>}
            {productProcessTemplates.selectedTemplatePreview && <li style={itemStyle}>Selected template: {productProcessTemplates.selectedTemplatePreview}</li>}
          </ul>
        </div>
      )}

      {servicing && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Servicing lifecycle (142E)</span>
          <ul style={ulStyle}>
            {servicing.lifecycleStage && <li style={itemStyle}>Stage: {servicing.lifecycleStage}</li>}
            {servicing.lifecycleHealth && <li style={itemStyle}>Health: {servicing.lifecycleHealth}</li>}
            {servicing.servicingExpectationCount !== undefined && <li style={itemStyle}>Servicing expectations: {servicing.servicingExpectationCount}</li>}
            {servicing.blockerCount !== undefined && <li style={itemStyle}>Blockers: {servicing.blockerCount}</li>}
            {servicing.nextBestAction && <li style={itemStyle}>Next: {servicing.nextBestAction}</li>}
          </ul>
        </div>
      )}

      {integration && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Integration readiness (142F)</span>
          <ul style={ulStyle}>
            {integration.requiredCount !== undefined && <li style={itemStyle}>Required integrations: {integration.requiredCount}</li>}
            {integration.blockedCount !== undefined && <li style={itemStyle}>Blocked integrations: {integration.blockedCount}</li>}
            {integration.missingPolicyApprovals !== undefined && <li style={itemStyle}>Missing policy approvals: {integration.missingPolicyApprovals}</li>}
            {integration.nextBestAction && <li style={itemStyle}>Next: {integration.nextBestAction}</li>}
          </ul>
        </div>
      )}

      {adminConfiguration && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Admin configuration review (142G)</span>
          <ul style={ulStyle}>
            {adminConfiguration.pendingCount !== undefined && <li style={itemStyle}>Pending proposals: {adminConfiguration.pendingCount}</li>}
            {adminConfiguration.blockedUnsafeCount !== undefined && <li style={itemStyle}>Blocked unsafe: {adminConfiguration.blockedUnsafeCount}</li>}
            {adminConfiguration.approvedNotAppliedCount !== undefined && <li style={itemStyle}>Approved (not applied): {adminConfiguration.approvedNotAppliedCount}</li>}
            {adminConfiguration.highRiskCount !== undefined && <li style={itemStyle}>High risk: {adminConfiguration.highRiskCount}</li>}
            {adminConfiguration.persistenceMode && <li style={itemStyle}>Persistence: {adminConfiguration.persistenceMode} (schema {adminConfiguration.persistenceSchemaStatus ?? 'not ready'})</li>}
            {adminConfiguration.applyPreviewReadyCount !== undefined && <li style={itemStyle}>Apply preview-ready: {adminConfiguration.applyPreviewReadyCount} · blocked: {adminConfiguration.applyBlockedCount ?? 0} (dry-run only {String(adminConfiguration.applyDryRunOnly ?? true)})</li>}
            {adminConfiguration.nextBestAction && <li style={itemStyle}>Next: {adminConfiguration.nextBestAction}</li>}
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
