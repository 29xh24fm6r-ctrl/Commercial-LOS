import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ExecutiveProductStrategyDashboardState } from './executiveStrategyTypes';

interface Props {
  state: ExecutiveProductStrategyDashboardState;
}

/**
 * Phase 142H — Executive product strategy panel (read-only).
 *
 * Shows the KPI ribbon, current vs target capability score, differentiators,
 * gaps, roadmap, risk summary, safety posture, and the executive narrative. It
 * is strategy / read-only: there is NO start-phase, create-task, apply-config,
 * enable-integration, register-route, export-final, approve-credit, waive, send,
 * fetch, or write affordance. Scores are strategic metadata, not live operations.
 */
export function ExecutiveProductStrategyPanel({ state }: Props) {
  return (
    <Card>
      <CardHeader title="Executive product strategy" subtitle="Read-only strategic control surface" />

      <div style={bannerStyle}>
        Strategy view only — product intelligence, not operational execution. No phase start, task, config apply, integration enablement, route registration, final export, credit decision, covenant waiver, outreach, fetch, or write occurs here.
      </div>

      <div style={kpiRibbonStyle}>
        {state.kpis.map((k) => (
          <div key={k.key} style={kpiTileStyle}>
            <span style={kpiValueStyle}>{k.value}{k.unit ?? ''}</span>
            <span style={kpiLabelStyle}>{k.label}</span>
            <span style={statusChipStyle}>{k.status.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      <dl style={metaStyle}>
        <Row label="Current capability score" value={`${state.currentCapabilityScore}%`} />
        <Row label="Target capability score" value={`${state.targetCapabilityScore}%`} />
        <Row label="Competitive coverage" value={`${state.competitiveCoveragePct}%`} />
        <Row label="Shipped / planned / blocked" value={`${state.shippedCapabilityCount} / ${state.plannedCapabilityCount} / ${state.blockedCapabilityCount}`} />
      </dl>

      <Section title="Top differentiators">
        <ul style={ulStyle}>
          {state.differentiators.slice(0, 8).map((d) => (
            <li key={d.key} style={itemStyle}>{d.title} — <em>{d.status}</em></li>
          ))}
        </ul>
      </Section>

      <Section title="Top gaps (intentionally governed)">
        <ul style={ulStyle}>
          {state.gaps.slice(0, 8).map((g) => (
            <li key={g.gapKey} style={itemStyle}>{g.title} — <em>{g.riskClass}</em> · next: {g.recommendedFuturePhase}</li>
          ))}
        </ul>
      </Section>

      <Section title="Reference platform comparison">
        <ul style={ulStyle}>
          {state.referencePlatforms.map((r) => (
            <li key={r.platformKey} style={itemStyle}>{r.name} ({r.platformType}) — {r.ogbAdoptionStatus}</li>
          ))}
        </ul>
      </Section>

      <Section title="Roadmap (governed, forward phases)">
        <ul style={ulStyle}>
          {state.roadmap.map((phase) => (
            <li key={phase.phaseId} style={itemStyle}>{phase.phaseId} — {phase.title} <em>({phase.riskClass})</em></li>
          ))}
        </ul>
      </Section>

      <Section title="Risk summary">
        <ul style={ulStyle}>
          <li style={itemStyle}>Backlog items: {state.riskSummary.totalBacklogItems}</li>
          <li style={itemStyle}>High-risk disabled: {state.riskSummary.highRiskDisabledCount}</li>
          {state.riskSummary.forbiddenCapabilities.map((f) => (
            <li key={f} style={blockerItemStyle}>Forbidden: {f}</li>
          ))}
        </ul>
      </Section>

      <Section title="Safety posture">
        <ul style={ulStyle}>
          {state.safetyPosture.items.slice(0, 8).map((s) => (
            <li key={s.category} style={blockerItemStyle}>{s.category}: {s.status.replace(/_/g, ' ')} — {s.reason}</li>
          ))}
        </ul>
      </Section>

      <Section title="Executive narrative">
        <span style={itemStyle}>{state.executiveNarrative.headline}</span>
        <span style={itemStyle}>{state.executiveNarrative.positioning}</span>
        {state.executiveNarrative.caveats.map((c) => (
          <span key={c} style={caveatStyle}>{c}</span>
        ))}
      </Section>

      {state.caveats.length > 0 && (
        <Section title="Data caveats">
          <ul style={ulStyle}>
            {state.caveats.map((c) => (
              <li key={c} style={caveatStyle}>{c}</li>
            ))}
          </ul>
        </Section>
      )}

      <CardFooter>
        <span>Strategic read-only control surface — product intelligence only. No operational execution, no external data, no writes.</span>
      </CardFooter>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={sectionStyle}>
      <span style={sectionTitleStyle}>{title}</span>
      {children}
    </div>
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

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const kpiRibbonStyle: CSSProperties = { display: 'flex', gap: spacing.md, flexWrap: 'wrap' };
const kpiTileStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140, border: `1px solid ${palette.border}`, borderRadius: 4, padding: spacing.xs };
const kpiValueStyle: CSSProperties = { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: palette.text };
const kpiLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const statusChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 200, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const caveatStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
