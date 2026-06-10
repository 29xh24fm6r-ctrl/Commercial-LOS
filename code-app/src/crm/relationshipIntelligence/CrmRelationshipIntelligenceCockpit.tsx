import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import { DrillThroughCard } from '../../shared/drillthrough/DrillThroughCard';
import { useDrillThroughDeepLink, deepLinkCardProps } from '../../shared/drillthrough/useDrillThroughDeepLink';
import { crmRelationshipSectionTargets } from './crmRelationshipDrillThrough';
import type { CrmRelationshipIntelligenceViewModel } from './crmRelationshipIntelligenceViewModel';

interface Props {
  viewModel?: CrmRelationshipIntelligenceViewModel;
}

/**
 * Phase 143H — CRM relationship intelligence cockpit (read-only).
 *
 * Combines CRM activation posture, Salesforce/nCino readiness, entity match, sync
 * preview, writeback policy, dry-run proof, and the activity timeline into one
 * read-only cockpit. There is NO live call, NO write control, and NO "sync now" /
 * "push now" button. Nothing is synced, pushed, or written here.
 */
export function CrmRelationshipIntelligenceCockpit({ viewModel }: Props) {
  // Phase 144E — per-section read-only drill-through + deep-link. The hook is
  // called unconditionally (Rules of Hooks); availability is gated by these
  // local section target ids — the panel payload never comes from the URL.
  const sectionTargets = viewModel
    ? crmRelationshipSectionTargets(viewModel.sections, viewModel.nextSafeStep)
    : {};
  const deepLink = useDrillThroughDeepLink(Object.values(sectionTargets).map((t) => t.id));

  if (!viewModel) {
    return (
      <Card>
        <CardHeader title="CRM Relationship Intelligence Cockpit" subtitle="Read-only — no live CRM action" />
        <div style={emptyStyle}>CRM relationship intelligence is unavailable until authorized inputs are provided.</div>
        <CardFooter><span>Read-only cockpit — no Salesforce/nCino sync, push, or write occurs here.</span></CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="CRM Relationship Intelligence Cockpit" subtitle="Read-only — no live CRM action" />
      <div style={bannerStyle}>
        Read-only CRM activation cockpit. All Salesforce/nCino activity is disabled, read-only, dry-run, or allowlist-gated. No record is synced, pushed, or written, and no external system is changed.
      </div>

      <div style={listStyle}>
        {viewModel.sections.map((s) => {
          const target = sectionTargets[s.key];
          const sectionFace = (
            <div style={sectionStyle}>
              <div style={sectionHeadStyle}>
                <span style={sectionTitleStyle}>{s.title}</span>
                <span style={statusChipStyle}>{s.status.replace(/_/g, ' ')}</span>
              </div>
              <span style={detailStyle}>{s.detail}</span>
            </div>
          );
          return target ? (
            <DrillThroughCard key={s.key} target={target} unstyled {...deepLinkCardProps(deepLink, target.id)}>
              {sectionFace}
            </DrillThroughCard>
          ) : (
            <div key={s.key}>{sectionFace}</div>
          );
        })}
      </div>

      <div style={nextStepStyle}>Next safe CRM activation step: {viewModel.nextSafeStep}</div>

      <CardFooter>
        <span>Read-only relationship intelligence — no live CRM call, no write control, and no sync/push action is available here.</span>
      </CardFooter>
    </Card>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.sm };
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, border: `1px solid ${palette.border}`, borderRadius: 4, padding: spacing.xs };
const sectionHeadStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const statusChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold };
const detailStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted };
const nextStepStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, marginTop: spacing.sm, fontWeight: typography.weight.semibold };
