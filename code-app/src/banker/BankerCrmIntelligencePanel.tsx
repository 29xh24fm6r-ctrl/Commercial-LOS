import type { CSSProperties } from 'react';
import { palette, spacing, typography } from '../shared/theme';
import { DrillThroughCard } from '../shared/drillthrough/DrillThroughCard';
import { buildDrillThroughTarget } from '../shared/drillthrough/drillThroughTypes';
import { CrmBankerWorkingSurface } from '../crm/workspaceIntegration/CrmBankerWorkingSurface';
import { bankerCrmPreviewInput } from '../crm/workspaceIntegration/crmWorkspacePreviewInputs';

/**
 * BUGFIX-PRODUCTION-CRM-CARDS-NOT-CLICKABLE-1 — drill-through-enabled CRM
 * entry on the Banker dashboard.
 *
 * Wraps the CRM Command Center in a DrillThroughCard so it is
 * clickable/keyboard-activatable and opens read-only detail. The six
 * CRM metric cells inside CrmBankerWorkingSurface are also wired to
 * drill-through via the drillThroughTargets prop.
 *
 * No fake CRM data. No sync/push/write controls. No live calls.
 */
export function BankerCrmIntelligencePanel() {
  const input = bankerCrmPreviewInput();

  const commandCenterTarget = buildDrillThroughTarget({
    id: 'banker-crm-command-center',
    title: 'CRM Command Center',
    subtitle: 'CRM and lending workflow preview intelligence',
    surface: 'crm_relationship_intelligence',
    entityKind: 'cockpit_widget',
    summary: 'Review source-of-truth, matching, sync preview, and dry-run posture.',
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

  return (
    <section aria-label="CRM Command Center" data-banker-crm-entry="command-center" style={styles.wrap}>
      <DrillThroughCard target={commandCenterTarget}>
        <div style={styles.face}>
          <span style={styles.faceTitle}>CRM Command Center</span>
          <span style={styles.faceSubtitle}>CRM and lending workflow preview intelligence</span>
          <span style={styles.faceSafety}>Read-only preview. No sync, push, or write actions.</span>
        </div>
      </DrillThroughCard>
      <CrmBankerWorkingSurface input={input} />
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  face: { display: 'flex', flexDirection: 'column', gap: 2 },
  faceTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: palette.text },
  faceSubtitle: { fontSize: typography.size.sm, color: palette.textMuted },
  faceSafety: { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' },
};
