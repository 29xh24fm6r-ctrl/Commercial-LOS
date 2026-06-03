import type { CSSProperties } from 'react';
import type { CopilotResponse } from './copilotAssistantAdapter';
import { palette, radius, spacing, typography } from '../shared/theme';

interface CopilotResponseCardProps {
  response: CopilotResponse;
}

export function CopilotResponseCard({ response }: CopilotResponseCardProps) {
  return (
    <div style={cardStyle}>
      {!response.isLive && (
        <div style={badgeRowStyle}>
          <span style={localBadgeStyle}>Local summary</span>
        </div>
      )}
      <pre style={textStyle}>{response.text}</pre>
      {response.sources.length > 0 && (
        <div style={sourceRowStyle}>
          <span style={sourceLabelStyle}>Sources:</span>
          {response.sources.map((s) => (
            <span key={s} style={sourceTagStyle}>
              {s}
            </span>
          ))}
        </div>
      )}
      <p style={disclaimerStyle}>
        {response.isLive
          ? 'Powered by Microsoft Copilot. Verify before acting.'
          : 'Generated locally from visible data. Not AI-generated. Not a recommendation.'}
      </p>
    </div>
  );
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.sm,
};

const badgeRowStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.xs,
};

const localBadgeStyle: CSSProperties = {
  display: 'inline-block',
  fontSize: typography.size.xs,
  fontWeight: typography.weight.semibold,
  color: palette.primaryFg,
  background: palette.primaryBg,
  padding: `2px ${spacing.sm}`,
  borderRadius: radius.sm,
  letterSpacing: typography.letterSpacing.label,
  textTransform: 'uppercase',
};

const textStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.sm,
  color: palette.text,
  lineHeight: typography.lineHeight.normal,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'inherit',
};

const sourceRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  flexWrap: 'wrap',
};

const sourceLabelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
};

const sourceTagStyle: CSSProperties = {
  display: 'inline-block',
  fontSize: typography.size.xs,
  color: palette.textMuted,
  background: palette.surfaceAlt,
  padding: `1px ${spacing.xs}`,
  borderRadius: radius.sm,
};

const disclaimerStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  fontStyle: 'italic',
  lineHeight: typography.lineHeight.snug,
};
