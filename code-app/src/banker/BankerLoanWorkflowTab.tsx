import type { CSSProperties } from 'react';
import { PersonalPipeline } from './PersonalPipeline';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 257 — Banker Loan Workflow entry surface.
 *
 * The "Loan Workflow" sidebar destination. The governed loan workflow
 * itself lives per deal (the deal cockpit's Loan Workflow Command Center:
 * current stage, next permitted stage, credit/closing readiness, and the
 * governed checklist / task / advance actions). This surface is the banker
 * entry point into that workflow: it lists the banker's authorized deals
 * and opens each deal's workflow on selection. No fabricated data — the
 * pipeline list is the same authorized loader used on Active Deals.
 */
export function BankerLoanWorkflowTab() {
  return (
    <section style={styles.wrap} aria-label="Loan Workflow" data-banker-loan-workflow="panel">
      <header style={styles.head}>
        <h2 style={styles.title}>Loan Workflow</h2>
        <p style={styles.subtitle}>
          Open a deal to manage its loan workflow — current stage, next permitted
          stage, credit and closing readiness, and the governed checklist, tasks,
          and stage advancement.
        </p>
      </header>
      <PersonalPipeline />
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: spacing.md, width: '100%' },
  head: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.xl}`,
  },
  title: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
    maxWidth: 720,
  },
};
