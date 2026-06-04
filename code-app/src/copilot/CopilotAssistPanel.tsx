import { useCallback, useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';
import { getCopilotAdapter, type CopilotResponse, type CopilotDealContext, type CopilotWorkspaceContext } from './copilotAssistantAdapter';
import {
  getCopilotConnector,
  type CopilotConnectorMode,
  type CopilotProposedAction,
} from './copilotConnector';
import { CopilotNotConfiguredState } from './CopilotNotConfiguredState';
import { CopilotPromptBar } from './CopilotPromptBar';
import { CopilotResponseCard } from './CopilotResponseCard';

type CopilotSurface = 'deal' | 'workspace';

interface CopilotAssistPanelProps {
  surface: CopilotSurface;
  dealContext?: CopilotDealContext;
  workspaceContext?: CopilotWorkspaceContext;
  /**
   * Safe, confirmation-required proposals from the governed connector.
   * Rendered ONLY when the connector is in a live mode (live_read_only /
   * proposal_only). Never rendered in not_configured / disabled, so the
   * default posture stays inert.
   */
  proposedActions?: CopilotProposedAction[];
  /** Collapsed by default on command surfaces. */
  defaultExpanded?: boolean;
}

type PromptAction =
  | 'summarize'
  | 'next-actions'
  | 'missing-fields'
  | 'blockers'
  | 'workspace-summary';

const READ_ONLY_DISCLAIMER =
  'Copilot can summarize and suggest. It cannot write or submit changes.';

function pillLabelFor(mode: CopilotConnectorMode): string {
  switch (mode) {
    case 'live_read_only':
      return 'Live read-only';
    case 'proposal_only':
      return 'Proposal only';
    case 'disabled':
      return 'Disabled';
    case 'not_configured':
    default:
      return 'Not configured';
  }
}

function pillAriaFor(mode: CopilotConnectorMode): string {
  switch (mode) {
    case 'live_read_only':
      return 'Copilot live read-only';
    case 'proposal_only':
      return 'Copilot proposal only';
    case 'disabled':
      return 'Copilot connector disabled';
    case 'not_configured':
    default:
      return 'Copilot connector not configured';
  }
}

export function CopilotAssistPanel({
  surface,
  dealContext,
  workspaceContext,
  proposedActions,
  defaultExpanded = false,
}: CopilotAssistPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [responses, setResponses] = useState<CopilotResponse[]>([]);
  const adapter = getCopilotAdapter();
  const connectorStatus = getCopilotConnector().status();

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

  // Legacy adapter posture (drives the honest not-configured copy +
  // the local summary path). Preserved for backward compatibility.
  const notConfigured = adapter.mode === 'not_configured';

  // Governed connector posture (drives the status pill + proposals).
  const mode = connectorStatus.mode;
  const isLiveMode = mode === 'live_read_only' || mode === 'proposal_only';
  const pillConnected = connectorStatus.connected && isLiveMode;
  const showProposals =
    isLiveMode && !!proposedActions && proposedActions.length > 0;

  return (
    <Card accentColor={palette.cobalt}>
      <CardHeader
        title="Copilot Assist"
        subtitle={
          notConfigured
            ? 'Connector not configured — local summaries only'
            : 'Microsoft Copilot'
        }
        trailing={
          <div style={trailingStyle}>
            <span
              style={pillConnected ? statusPillLiveStyle : statusPillMutedStyle}
              aria-label={pillAriaFor(mode)}
            >
              {pillLabelFor(mode)}
            </span>
            <button
              onClick={() => setExpanded((e) => !e)}
              style={toggleStyle}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse Copilot panel' : 'Expand Copilot panel'}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        }
      />

      {expanded && (
        <div style={bodyStyle}>
          {adapter.mode === 'not_configured' && <CopilotNotConfiguredState />}

          <p style={disclaimerStyle} role="note">
            {READ_ONLY_DISCLAIMER}
          </p>

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

          {showProposals && (
            <ProposedActions actions={proposedActions!} />
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

/**
 * Proposed actions are SUGGESTIONS only. open_screen renders a safe
 * in-page anchor; every other type renders a non-executing card with a
 * "Requires confirmation" badge. No proposal performs a write, send, or
 * approval — execution (if ever) is a separate, explicitly-confirmed spec.
 */
function ProposedActions({ actions }: { actions: CopilotProposedAction[] }) {
  return (
    <section style={proposalsWrapStyle} aria-label="Copilot proposed actions">
      <span style={quickActionsLabelStyle}>Proposed (requires your confirmation):</span>
      <ul style={proposalListStyle}>
        {actions.map((a) => {
          const anchor =
            a.action_type === 'open_screen' &&
            typeof a.payload?.anchor === 'string'
              ? (a.payload.anchor as string)
              : undefined;
          return (
            <li
              key={a.action_id}
              style={proposalCardStyle}
              data-copilot-proposal={a.action_type}
            >
              <div style={proposalHeadStyle}>
                {anchor ? (
                  <a href={anchor} style={proposalLinkStyle}>
                    {a.label}
                  </a>
                ) : (
                  <span style={proposalLabelStyle}>{a.label}</span>
                )}
                <span style={confirmBadgeStyle}>Requires confirmation</span>
              </div>
              <p style={proposalRationaleStyle}>{a.rationale}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.md,
};

const disclaimerStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.xs,
  color: palette.textMuted,
  fontStyle: 'italic',
  lineHeight: typography.lineHeight.snug,
};

const trailingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  flexWrap: 'wrap',
};

const statusPillBaseStyle: CSSProperties = {
  display: 'inline-block',
  padding: `2px ${spacing.sm}`,
  borderRadius: radius.pill,
  fontSize: typography.size.xs,
  fontWeight: typography.weight.semibold,
  letterSpacing: typography.letterSpacing.label,
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
};

// Honest muted pill — used for not_configured / disabled, and for any
// live mode that is NOT actually connected. Never implies an active
// connector.
const statusPillMutedStyle: CSSProperties = {
  ...statusPillBaseStyle,
  background: palette.surfaceAlt,
  color: palette.textSubtle,
  border: `1px solid ${palette.border}`,
};

// Cobalt "live" pill — only used when the connector reports
// connected === true in a live mode. No fake connected state.
const statusPillLiveStyle: CSSProperties = {
  ...statusPillBaseStyle,
  background: palette.cobaltBg,
  color: palette.cobaltFg,
  border: `1px solid ${palette.cobalt}`,
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

const proposalsWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};

const proposalListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};

const proposalCardStyle: CSSProperties = {
  border: `1px solid ${palette.border}`,
  borderLeft: `3px solid ${palette.cobalt}`,
  borderRadius: radius.sm,
  padding: `${spacing.xs} ${spacing.sm}`,
  background: palette.surfaceAlt,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const proposalHeadStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: spacing.sm,
};

const proposalLabelStyle: CSSProperties = {
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  color: palette.text,
};

const proposalLinkStyle: CSSProperties = {
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  color: palette.primary,
  textDecoration: 'none',
};

const confirmBadgeStyle: CSSProperties = {
  fontSize: typography.size.xs,
  fontWeight: typography.weight.semibold,
  color: palette.textSubtle,
  letterSpacing: typography.letterSpacing.label,
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const proposalRationaleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.xs,
  color: palette.textMuted,
  lineHeight: typography.lineHeight.snug,
};
