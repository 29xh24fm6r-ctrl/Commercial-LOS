import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../Card';
import { palette, spacing, typography } from '../theme';
import {
  hasDrillThroughContent,
  resolveDrillThroughAction,
  type DetailSection,
  type DrillThroughTarget,
} from './drillThroughTypes';

interface Props {
  target: DrillThroughTarget;
  /** Optional heading id so a parent disclosure can label its region. */
  headingId?: string;
}

/**
 * Phase 144A — read-only drill-through detail panel.
 *
 * Renders the full information behind a card/tile/row/KPI: summary, how the
 * number/status was derived (source fields + counts), warnings, blockers, detail
 * sections, and the next safe review step — OR a safe link to an EXISTING
 * authorized route — OR an honest unavailable state that says exactly what is
 * missing. It performs NO write, NO fetch, NO navigation side effect, and shows
 * NO fabricated rows. Every panel is explicitly labelled read-only.
 */
export function DrillThroughPanel({ target, headingId }: Props) {
  const action = resolveDrillThroughAction(target);

  return (
    <Card>
      <CardHeader
        title={target.title}
        subtitle={target.subtitle ?? 'Read-only details'}
        trailing={<span style={readOnlyBadgeStyle}>Read-only</span>}
      />
      {headingId && <span id={headingId} style={srOnlyStyle}>{target.title} details</span>}

      {target.statusLabel && <div style={statusStyle}>{target.statusLabel}</div>}
      <p style={summaryStyle}>{target.summary}</p>

      {action.kind === 'unavailable' ? (
        <div style={unavailableStyle}>{action.reason}</div>
      ) : action.kind === 'route' ? (
        <a href={action.href} style={routeLinkStyle}>Open full record</a>
      ) : (
        <div style={listStyle}>
          {target.sourceCounts.length > 0 && (
            <Section title="Contributing counts">
              <div style={countStripStyle}>
                {target.sourceCounts.map((c) => (
                  <div key={c.label} style={countTileStyle}>
                    <span style={countValueStyle}>{c.count}</span>
                    <span style={countLabelStyle}>{c.label}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {target.sourceFields.length > 0 && (
            <Section title="How this was derived">
              <dl style={dlStyle}>
                {target.sourceFields.map((r) => (
                  <div key={r.label} style={dlRowStyle}>
                    <dt style={dtStyle}>{r.label}</dt>
                    <dd style={ddStyle}>
                      {r.value}
                      {r.source && <span style={sourceTagStyle}> · {r.source}</span>}
                      {r.confidence && <span style={confTagStyle}> · {r.confidence} confidence</span>}
                      {r.warning && <span style={rowWarnStyle}> · {r.warning}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {target.detailSections.map((s) => (
            <SectionBlock key={s.title} section={s} />
          ))}

          {target.warnings.length > 0 && (
            <Section title="Warnings">
              <ul style={ulStyle}>
                {target.warnings.map((w) => (
                  <li key={w} style={warnItemStyle}>{w}</li>
                ))}
              </ul>
            </Section>
          )}

          {target.blockers.length > 0 && (
            <Section title="Blockers">
              <ul style={ulStyle}>
                {target.blockers.map((b) => (
                  <li key={b} style={blockerItemStyle}>{b}</li>
                ))}
              </ul>
            </Section>
          )}

          {target.routeHref && (
            <a href={target.routeHref} style={routeLinkStyle}>Open full record</a>
          )}
        </div>
      )}

      {target.nextReviewStep && (
        <div style={nextStepStyle}>Next safe review step: {target.nextReviewStep}</div>
      )}

      <CardFooter>
        <span>Read-only detail — no write, no live call, and no state change occurs here.</span>
      </CardFooter>
    </Card>
  );
}

function SectionBlock({ section }: { section: DetailSection }) {
  return (
    <Section title={section.title}>
      {section.rows.length === 0 ? (
        <div style={emptyStyle}>{section.emptyMessage ?? 'No detail available.'}</div>
      ) : (
        <dl style={dlStyle}>
          {section.rows.map((r) => (
            <div key={r.label} style={dlRowStyle}>
              <dt style={dtStyle}>{r.label}</dt>
              <dd style={ddStyle}>
                {r.value}
                {r.source && <span style={sourceTagStyle}> · {r.source}</span>}
                {r.warning && <span style={rowWarnStyle}> · {r.warning}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <span style={sectionTitleStyle}>{title}</span>
      {children}
    </div>
  );
}

/** True when the panel will render substantive detail (vs. route/unavailable). */
export function drillThroughPanelShowsContent(target: DrillThroughTarget): boolean {
  return hasDrillThroughContent(target);
}

const readOnlyBadgeStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.neutralFg, background: palette.neutralBg, padding: `2px ${spacing.xs}`, borderRadius: 999, fontWeight: typography.weight.semibold };
const srOnlyStyle: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };
const statusStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const summaryStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug };
const unavailableStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.sm, background: palette.surfaceSubtle, borderRadius: 4 };
const routeLinkStyle: CSSProperties = { color: palette.link, textDecoration: 'none', fontSize: typography.size.sm, fontWeight: typography.weight.semibold };
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const countStripStyle: CSSProperties = { display: 'flex', gap: spacing.md, flexWrap: 'wrap' };
const countTileStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96 };
const countValueStyle: CSSProperties = { fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text };
const countLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label };
const dlStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const dlRowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 180, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sourceTagStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const confTagStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const rowWarnStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRiskFg };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const warnItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const nextStepStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold, marginTop: spacing.xs };
