import { type CSSProperties } from 'react';
import { palette, spacing, typography } from '../shared/theme';
import { buildExecutiveProductStrategySurfaceState } from '../competitive/buildExecutiveProductStrategySurfaceState';
import { ExecutiveProductStrategyPanel } from '../competitive/ExecutiveProductStrategyPanel';
import { CompetitiveReferencePlatformPanel } from '../competitive/CompetitiveReferencePlatformPanel';
import { CompetitiveSafetyPosturePanel } from '../competitive/CompetitiveSafetyPosturePanel';
import { CompetitiveCapabilityDashboard } from '../competitive/CompetitiveCapabilityDashboard';
import type { ExecutiveProductStrategyDashboardState } from '../competitive/executiveStrategyTypes';

interface Props {
  /** Pre-composed strategy state. Defaults to the static registry-derived state. */
  state?: ExecutiveProductStrategyDashboardState;
}

/**
 * Phase 142I — Executive product strategy workspace (read-only inner content).
 *
 * Renders the Phase 142H competitive / product-strategy dashboard inside the
 * executive shell. This component is the executive route's `?surface=product-strategy`
 * rendering surface — it inherits the executive WorkspaceGate's fail-closed
 * gating. It is read-only: NO action buttons, NO mutation callbacks, NO data
 * fetch, NO Dataverse/CRM calls, NO external URLs. Missing optional metadata
 * renders caveats rather than failing.
 */
export function ExecutiveProductStrategyWorkspace({ state }: Props = {}) {
  const strategyState = state ?? buildExecutiveProductStrategySurfaceState();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.eyebrow}>Commercial Lending · Board-safe view</div>
        <h1 style={styles.title}>Product Strategy Command Center</h1>
        <p style={styles.subtitle}>
          Read-only competitive platform strategy, capability gaps, roadmap, and safety posture —
          derived from static governed registries, not live operational data.
        </p>
      </header>

      <div style={styles.banner}>
        Read-only strategy surface. No configuration changes, integrations, credit decisions, borrower outreach, or live writes are available here.
      </div>

      <main style={styles.main}>
        <ExecutiveProductStrategyPanel state={strategyState} />
        <CompetitiveReferencePlatformPanel platforms={strategyState.referencePlatforms} />
        <CompetitiveSafetyPosturePanel safetyPosture={strategyState.safetyPosture} />
        {/* Base 142A capability dashboard for context — NOT passed the strategy
            state, so it does not re-render the three panels above. */}
        <CompetitiveCapabilityDashboard />
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { fontFamily: typography.family, color: palette.text, background: palette.pageBg },
  header: {
    padding: `${spacing.xl} ${spacing.xxl}`,
    background: palette.surface,
    borderBottom: `1px solid ${palette.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  title: {
    margin: 0,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
    maxWidth: 720,
  },
  banner: {
    margin: `${spacing.md} ${spacing.xxl} 0`,
    fontSize: typography.size.sm,
    color: palette.atRiskFg,
    background: palette.atRiskBg,
    padding: spacing.sm,
    borderRadius: 4,
  },
  main: { padding: `${spacing.xl} ${spacing.xxl}` },
};
