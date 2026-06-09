import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { COMPETITIVE_CAPABILITY_MATRIX } from './competitiveCapabilityMatrix';
import { deriveCompetitiveReferenceLessons } from './deriveCompetitiveReferenceLessons';
import { deriveCompetitiveImplementationBacklog } from './deriveCompetitiveImplementationBacklog';

/**
 * Phase 142A — Competitive capability dashboard (strategy / read-only).
 *
 * Shows OGB current vs target, top gaps, shipped differentiators, the prioritized
 * backlog (with risk class), and recommended next phases. Strategy-only: no
 * production customer data, no external calls, no iframe/repo scraping, no write
 * controls, and no route registration.
 */
export function CompetitiveCapabilityDashboard() {
  const lessons = deriveCompetitiveReferenceLessons();
  const backlog = deriveCompetitiveImplementationBacklog();

  const differentiators = COMPETITIVE_CAPABILITY_MATRIX.categories.filter((c) => {
    const current = c.cells.find((x) => x.sourcePlatform === 'ogb_los_current')?.score;
    return current === 3;
  });

  return (
    <Card>
      <CardHeader title="Competitive platform convergence" subtitle="Product strategy — read-only" />

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>OGB current vs target — top gaps to close</span>
        {lessons.gapsToClose.length === 0 ? (
          <span style={noneStyle}>No open gaps.</span>
        ) : (
          <ul style={ulStyle}>
            {lessons.gapsToClose.map((g) => (
              <li key={g.categoryKey} style={itemStyle}>
                {g.categoryName}: {String(g.currentScore)} → {String(g.targetScore)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Shipped differentiators</span>
        <ul style={ulStyle}>
          {differentiators.map((c) => (
            <li key={c.categoryKey} style={itemStyle}>{c.categoryName}</li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Capability matrix (categories × platforms)</span>
        <span style={itemStyle}>
          {COMPETITIVE_CAPABILITY_MATRIX.categories.length} categories scored across {COMPETITIVE_CAPABILITY_MATRIX.platforms.length} platforms.
        </span>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Implementation backlog (with risk class)</span>
        <ul style={ulStyle}>
          {backlog.items.map((b) => (
            <li key={b.key} style={itemStyle}>
              {b.priority}. {b.title} — <em>{b.riskClass}</em>
            </li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Next recommended phases</span>
        <ul style={ulStyle}>
          {backlog.recommendedPhases.map((p) => (
            <li key={p} style={itemStyle}>{p}</li>
          ))}
        </ul>
      </div>

      <CardFooter>
        <span>Strategy view only. No external data, no writes, no final credit decisions.</span>
      </CardFooter>
    </Card>
  );
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
