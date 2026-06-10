import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { CrmBankerWorkingSurface } from '../crm/workspaceIntegration/CrmBankerWorkingSurface';
import { bankerCrmPreviewInput } from '../crm/workspaceIntegration/crmWorkspacePreviewInputs';

/**
 * BUGFIX-PRODUCTION-CRM-SURFACES-NOT-VISIBLE-1 — visible CRM entry on the
 * Banker dashboard.
 *
 * Mounts the Phase 148 CRM Command Center entry + the read-only CRM banker
 * working surface near the top of the Banker dashboard so the CRM /
 * Salesforce+nCino preview intelligence is visible without hunting. The working
 * surface renders in an HONEST preview / not-yet-connected posture (no live data
 * provider is wired into the banker context yet) — no fake CRM data, no fake sync
 * success, no write controls, no live calls.
 */
export function BankerCrmIntelligencePanel() {
  return (
    <section aria-label="CRM Command Center" data-banker-crm-entry="command-center" style={styles.wrap}>
      <Card>
        <CardHeader
          title="CRM Command Center"
          subtitle="Salesforce and nCino preview intelligence"
        />
        <p style={styles.desc}>
          Review source-of-truth, matching, sync preview, and dry-run posture.
        </p>
        <p style={styles.safety}>
          Read-only preview intelligence. No sync, push, or write actions.
        </p>
      </Card>
      <CrmBankerWorkingSurface input={bankerCrmPreviewInput()} />
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  desc: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
  safety: { margin: 0, marginTop: spacing.xs, fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' },
};
