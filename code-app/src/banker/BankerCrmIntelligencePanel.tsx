import type { CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import { DrillThroughCard } from '../shared/drillthrough/DrillThroughCard';
import { buildDrillThroughTarget } from '../shared/drillthrough/drillThroughTypes';
import { CrmBankerWorkingSurface } from '../crm/workspaceIntegration/CrmBankerWorkingSurface';
import { bankerCrmPreviewInput } from '../crm/workspaceIntegration/crmWorkspacePreviewInputs';

/**
 * Phase 157 — Premium CRM Command Center cockpit on the Banker dashboard.
 *
 * Prominent command card, six readable drill-through intelligence cards,
 * CRM and Lending Workflow readiness lanes, and relationship intelligence
 * summary. All copy uses neutral OGB-owned terminology. No fake CRM data.
 * No sync/push/write controls. No live calls. No vendor names.
 */
export function BankerCrmIntelligencePanel() {
  const input = bankerCrmPreviewInput();

  const commandCenterTarget = buildDrillThroughTarget({
    id: 'banker-crm-command-center',
    title: 'CRM Command Center',
    subtitle: 'CRM and lending workflow preview intelligence',
    surface: 'crm_relationship_intelligence',
    entityKind: 'cockpit_widget',
    summary: 'Review source-of-truth, relationship matching, sync preview, and dry-run readiness from the current banker workspace.',
    detailSections: [
      {
        title: 'Posture',
        rows: [
          { label: 'Safety', value: 'Read-only, preview-only. No sync, push, or write actions.' },
          { label: 'Next safe step', value: 'Review source-of-truth, matching, sync preview, and dry-run posture.' },
          { label: 'Derivation', value: 'Derived from local preview input / current banker workspace context.' },
        ],
      },
    ],
  });

  const crmLaneTarget = buildDrillThroughTarget({
    id: 'banker-crm-lane-crm-readiness',
    title: 'CRM Readiness',
    surface: 'crm_connector_readiness',
    entityKind: 'status',
    summary: input.salesforceReadiness,
    detailSections: [{
      title: 'CRM Readiness',
      rows: [
        { label: 'Status', value: input.salesforceReadiness },
        { label: 'Posture', value: 'Preview-only. External connection disabled.' },
        { label: 'Next step', value: 'Review CRM readiness prerequisites and connector configuration.' },
      ],
    }],
  });

  const lendingLaneTarget = buildDrillThroughTarget({
    id: 'banker-crm-lane-lending-readiness',
    title: 'Lending Workflow Readiness',
    surface: 'crm_connector_readiness',
    entityKind: 'status',
    summary: input.ncinoReadiness,
    detailSections: [{
      title: 'Lending Workflow Readiness',
      rows: [
        { label: 'Status', value: input.ncinoReadiness },
        { label: 'Posture', value: 'Preview-only. External connection disabled.' },
        { label: 'Next step', value: 'Review lending workflow readiness and document checklist configuration.' },
      ],
    }],
  });

  const relSummaryTarget = buildDrillThroughTarget({
    id: 'banker-crm-relationship-summary',
    title: 'Relationship Intelligence Summary',
    surface: 'crm_relationship_intelligence',
    entityKind: 'intelligence_panel',
    summary: 'Relationship status, match review, source-of-truth gaps, and sync blockers.',
    detailSections: [{
      title: 'Relationship Intelligence',
      rows: [
        { label: 'Relationship', value: input.relationshipOverview ?? 'Not available' },
        { label: 'Match review', value: input.entityMatchStatus },
        { label: 'Source-of-truth gaps', value: String(input.sourceOfTruthGaps) },
        { label: 'Sync blockers', value: String(input.syncPreviewBlockers) },
        { label: 'Next step', value: input.nextSafeBankerStep },
      ],
    }],
  });

  return (
    <section aria-label="CRM Command Center" data-banker-crm-entry="command-center" style={s.wrap}>
      {/* Hero command card */}
      <DrillThroughCard target={commandCenterTarget}>
        <div style={s.heroFace}>
          <div style={s.heroTitleRow}>
            <span style={s.heroTitle}>CRM Command Center</span>
            <span style={s.badge}>Read-only</span>
            <span style={s.badgePreview}>Preview-only</span>
          </div>
          <span style={s.heroSubtitle}>CRM and lending workflow preview intelligence</span>
          <span style={s.heroDesc}>
            Review source-of-truth, relationship matching, sync preview, and dry-run readiness from the current banker workspace.
          </span>
        </div>
      </DrillThroughCard>

      {/* Six intelligence cards */}
      <CrmBankerWorkingSurface input={input} />

      {/* Readiness lanes */}
      <div style={s.laneGrid}>
        <DrillThroughCard target={crmLaneTarget}>
          <div style={s.laneCard}>
            <span style={s.laneTitle}>CRM Readiness</span>
            <span style={s.laneValue}>{input.salesforceReadiness}</span>
            <span style={s.laneHint}>Next: Review CRM readiness prerequisites</span>
          </div>
        </DrillThroughCard>
        <DrillThroughCard target={lendingLaneTarget}>
          <div style={s.laneCard}>
            <span style={s.laneTitle}>Lending Workflow Readiness</span>
            <span style={s.laneValue}>{input.ncinoReadiness}</span>
            <span style={s.laneHint}>Next: Review lending workflow configuration</span>
          </div>
        </DrillThroughCard>
      </div>

      {/* Relationship intelligence summary */}
      <DrillThroughCard target={relSummaryTarget}>
        <div style={s.relSummary}>
          <span style={s.relTitle}>Relationship Intelligence Summary</span>
          <div style={s.relMetrics}>
            <span style={s.relMetric}>Relationship: {input.relationshipOverview ?? 'Not available'}</span>
            <span style={s.relMetric}>Match: {input.entityMatchStatus}</span>
            <span style={s.relMetric}>SoT Gaps: {input.sourceOfTruthGaps}</span>
            <span style={s.relMetric}>Sync Blocked: {input.syncPreviewBlockers}</span>
          </div>
          <span style={s.relNext}>Next: {input.nextSafeBankerStep}</span>
        </div>
      </DrillThroughCard>
    </section>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%' },

  // Hero — full width, prominent
  heroFace: { display: 'flex', flexDirection: 'column', gap: spacing.md, padding: `${spacing.xl} ${spacing.xl}`, background: palette.primaryBg, borderRadius: radius.md, border: `2px solid ${palette.primary}`, width: '100%', boxSizing: 'border-box' },
  heroTitleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  heroTitle: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.text, letterSpacing: typography.letterSpacing.heading },
  heroSubtitle: { fontSize: typography.size.md, color: palette.textMuted, fontWeight: typography.weight.semibold },
  heroDesc: { fontSize: typography.size.sm, color: palette.text, lineHeight: typography.lineHeight.snug, maxWidth: 640 },
  badge: { display: 'inline-block', fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: palette.primaryFg, background: palette.primary, padding: `3px ${spacing.md}`, borderRadius: radius.sm, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label },
  badgePreview: { display: 'inline-block', fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: palette.infoFg, background: palette.infoBg, padding: `3px ${spacing.md}`, borderRadius: radius.sm, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label },

  // Lanes — substantial, fill columns
  laneGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.lg, width: '100%' },
  laneCard: { display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: `${spacing.lg} ${spacing.xl}`, background: palette.surface, borderRadius: radius.md, border: `1px solid ${palette.border}`, minHeight: 120, justifyContent: 'center' },
  laneTitle: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  laneValue: { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold },
  laneHint: { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic', marginTop: spacing.xs },

  // Relationship summary — full width
  relSummary: { display: 'flex', flexDirection: 'column', gap: spacing.md, padding: `${spacing.lg} ${spacing.xl}`, background: palette.surface, borderRadius: radius.md, border: `1px solid ${palette.border}`, width: '100%', boxSizing: 'border-box' },
  relTitle: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  relMetrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: spacing.md },
  relMetric: { fontSize: typography.size.sm, color: palette.textMuted, padding: `${spacing.sm} ${spacing.md}`, background: palette.surfaceAlt, borderRadius: radius.sm },
  relNext: { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', marginTop: spacing.xs },
};
