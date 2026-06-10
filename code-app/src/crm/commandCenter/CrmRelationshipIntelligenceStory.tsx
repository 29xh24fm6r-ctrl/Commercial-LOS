import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography, radius } from '../../shared/theme';

export interface RelationshipStoryInput {
  relationshipName: string | undefined;
  sourceOfTruthConfidence: string | undefined;
  matchConfidence: string | undefined;
  conflicts: readonly string[];
  bankerNextReviewItems: readonly string[];
  activitySignals: readonly string[];
  documentSignals: readonly string[];
  crossSellAvailable: boolean;
  whyThisMatters: string;
}

interface Props {
  input: RelationshipStoryInput;
}

export function CrmRelationshipIntelligenceStory({ input }: Props) {
  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader
          title="Relationship Intelligence"
          subtitle={input.relationshipName ?? 'No relationship context available'}
        />
        <p style={whyStyle}>{input.whyThisMatters}</p>

        <div style={gridStyle}>
          <ConfidenceCard label="Source-of-Truth" value={input.sourceOfTruthConfidence} />
          <ConfidenceCard label="Match Confidence" value={input.matchConfidence} />
        </div>
      </Card>

      {input.conflicts.length > 0 && (
        <Card accentColor={palette.atRisk}>
          <CardHeader title={`Conflict Tape (${input.conflicts.length})`} />
          {input.conflicts.map((c, i) => (
            <div key={i} style={conflictRowStyle}>
              <span style={conflictDotStyle} />
              <span style={conflictTextStyle}>{c}</span>
            </div>
          ))}
        </Card>
      )}

      {input.bankerNextReviewItems.length > 0 && (
        <Card>
          <CardHeader title="Banker Next Review" />
          {input.bankerNextReviewItems.map((item, i) => (
            <div key={i} style={listRowStyle}>{item}</div>
          ))}
        </Card>
      )}

      {input.activitySignals.length > 0 && (
        <Card>
          <CardHeader title="Activity Signals" />
          {input.activitySignals.map((s, i) => (
            <div key={i} style={signalRowStyle}>{s}</div>
          ))}
        </Card>
      )}

      {input.documentSignals.length > 0 && (
        <Card>
          <CardHeader title="Document / Committee Signals" />
          {input.documentSignals.map((s, i) => (
            <div key={i} style={signalRowStyle}>{s}</div>
          ))}
        </Card>
      )}

      {input.crossSellAvailable && (
        <Card>
          <CardHeader title="Cross-Sell / Deposit Signal Availability" />
          <p style={availableStyle}>Cross-sell and deposit signals are available from CRM data.</p>
          <CardFooter><span>Data availability only. No revenue estimate. No fake cross-sell dollars.</span></CardFooter>
        </Card>
      )}

      {!input.crossSellAvailable && (
        <Card>
          <CardHeader title="Cross-Sell / Deposit Signals" />
          <p style={unavailableStyle}>Cross-sell and deposit signals are not available from current CRM data.</p>
        </Card>
      )}
    </div>
  );
}

function ConfidenceCard({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={confidenceCellStyle}>
      <span style={confidenceLabelStyle}>{label}</span>
      <span style={value ? confidenceValueStyle : confidenceUnavailableStyle}>{value ?? 'Not evaluated'}</span>
    </div>
  );
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md };
const confidenceCellStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, padding: spacing.md, background: palette.surfaceAlt, borderRadius: radius.md };
const confidenceLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const confidenceValueStyle: CSSProperties = { fontSize: typography.size.md, color: palette.text, fontWeight: typography.weight.semibold };
const confidenceUnavailableStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const conflictRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const conflictDotStyle: CSSProperties = { width: 8, height: 8, borderRadius: '50%', background: palette.atRisk, flexShrink: 0 };
const conflictTextStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const listRowStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const signalRowStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const whyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text, lineHeight: typography.lineHeight.snug, fontWeight: typography.weight.semibold };
const availableStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.clear };
const unavailableStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
