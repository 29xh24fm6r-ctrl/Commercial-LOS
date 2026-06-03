import { useCallback, useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { getCopilotAdapter, type CopilotResponse, type CopilotDealContext, type CopilotWorkspaceContext } from './copilotAssistantAdapter';
import { CopilotNotConfiguredState } from './CopilotNotConfiguredState';
import { CopilotPromptBar } from './CopilotPromptBar';
import { CopilotResponseCard } from './CopilotResponseCard';

type CopilotSurface = 'deal' | 'workspace';

interface CopilotAssistPanelProps {
  surface: CopilotSurface;
  dealContext?: CopilotDealContext;
  workspaceContext?: CopilotWorkspaceContext;
  /** Collapsed by default on command surfaces. */
  defaultExpanded?: boolean;
}

type PromptAction =
  | 'summarize'
  | 'next-actions'
  | 'missing-fields'
  | 'blockers'
  | 'workspace-summary';

export function CopilotAssistPanel({
  surface,
  dealContext,
  workspaceContext,
  defaultExpanded = false,
}: CopilotAssistPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [responses, setResponses] = useState<CopilotResponse[]>([]);
  const adapter = getCopilotAdapter();

  const handleAction = useCallback(
    (action: PromptAction) => {
      let response: CopilotResponse | undefined;

      if (surface === 'deal' && dealContext) {
        switch (action) {
          case 'summarize':
            response = adapter.summarizeDeal(dealContext);
            break;
          case 'next-actions':
            response = adapter.suggestNextActions(dealContext);
            break;
          case 'missing-fields':
            response = adapter.explainMissingFields(dealContext);
            break;
          case 'blockers':
            response = adapter.explainBlockers(dealContext);
            break;
        }
      } else if (surface === 'workspace' && workspaceContext) {
        if (action === 'summarize' || action === 'workspace-summary') {
          response = adapter.summarizeWorkspace(workspaceContext);
        }
      }

      if (response) {
        setResponses((prev) => [...prev, response]);
      }
    },
    [surface, dealContext, workspaceContext, adapter],
  );

  const handlePrompt = useCallback(
    (_prompt: string) => {
      // In the not_configured state, map free-text prompts to the best
      // matching local action. A live connector would forward the prompt
      // directly.
      if (surface === 'deal') {
        handleAction('summarize');
      } else {
        handleAction('workspace-summary');
      }
    },
    [surface, handleAction],
  );

  return (
    <Card>
      <CardHeader
        title="Copilot Assist"
        subtitle={
          adapter.mode === 'not_configured'
            ? 'Connector not configured — local summaries only'
            : 'Microsoft Copilot'
        }
        trailing={
          <button
            onClick={() => setExpanded((e) => !e)}
            style={toggleStyle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse Copilot panel' : 'Expand Copilot panel'}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        }
      />

      {expanded && (
        <div style={bodyStyle}>
          {adapter.mode === 'not_configured' && <CopilotNotConfiguredState />}

          {surface === 'deal' && dealContext && (
            <div style={quickActionsStyle}>
              <span style={quickActionsLabelStyle}>Quick actions:</span>
              <button style={chipStyle} onClick={() => handleAction('summarize')}>
                Summarize deal
              </button>
              <button style={chipStyle} onClick={() => handleAction('next-actions')}>
                Next actions
              </button>
              <button style={chipStyle} onClick={() => handleAction('missing-fields')}>
                Missing fields
              </button>
              <button style={chipStyle} onClick={() => handleAction('blockers')}>
                Explain blockers
              </button>
            </div>
          )}

          {surface === 'workspace' && workspaceContext && (
            <div style={quickActionsStyle}>
              <span style={quickActionsLabelStyle}>Quick actions:</span>
              <button style={chipStyle} onClick={() => handleAction('workspace-summary')}>
                Summarize workspace
              </button>
            </div>
          )}

          {responses.map((r, i) => (
            <CopilotResponseCard key={i} response={r} />
          ))}

          <CopilotPromptBar onSubmit={handlePrompt} />
        </div>
      )}

      <CardFooter>
        <span>
          {adapter.mode === 'not_configured'
            ? 'Copilot connector not configured. Local summaries only. No AI. No external calls.'
            : 'Powered by Microsoft Copilot. Verify before acting.'}
        </span>
        <span>Read-only assistant. Cannot approve, change data, or send communications.</span>
      </CardFooter>
    </Card>
  );
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.md,
};

const toggleStyle: CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  fontSize: typography.size.xs,
  fontWeight: typography.weight.semibold,
  color: palette.primary,
  background: 'transparent',
  border: `1px solid ${palette.border}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textTransform: 'uppercase' as const,
  letterSpacing: typography.letterSpacing.label,
};

const quickActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  flexWrap: 'wrap',
};

const quickActionsLabelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  fontWeight: typography.weight.semibold,
  textTransform: 'uppercase' as const,
  letterSpacing: typography.letterSpacing.label,
};

const chipStyle: CSSProperties = {
  padding: `${spacing.xs} ${spacing.md}`,
  fontSize: typography.size.xs,
  color: palette.text,
  background: palette.surfaceAlt,
  border: `1px solid ${palette.border}`,
  borderRadius: '12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
