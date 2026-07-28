import { useMemo, useState } from 'react';
import { useDealData } from '../deals/DealDataProvider';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';
import { buildSafeTeamsChannelPreview } from './teamsChannelContentPolicy';
import { getTeamsChannelPostAdapter } from './teamsChannelPostAdapter';
import type { TeamsChannelPostOutcome } from './teamsChannelPostModel';

export function TeamsChannelPostPanel() {
  const { deal } = useDealData();
  const dealName = (deal as typeof deal & { dealName?: string }).dealName ?? deal.name;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [outcome, setOutcome] = useState<TeamsChannelPostOutcome | undefined>();
  const proposal = useMemo(
    () => buildSafeTeamsChannelPreview({
      dealId: deal.id,
      dealName,
      stage: deal.stage,
      assignedBanker: deal.bankerName,
      blockers: [],
      nextAction: 'Review current blockers and next action owner.',
      losDeepLink: `#/deals/${deal.id}`,
      targetAlias: 'credit-ops-test-channel',
      correlationId: `teams-post-${deal.id}`,
    }),
    [deal.bankerName, deal.id, deal.stage, dealName],
  );

  async function confirmPost() {
    setOutcome(await getTeamsChannelPostAdapter().post(proposal));
  }

  return (
    <Card accentColor={palette.teal}>
      <CardHeader
        title="Teams channel post"
        subtitle="Proposal-only, server-side boundary required."
        trailing={<span style={pillStyle}>WRITE_DISABLED</span>}
      />
      <button type="button" style={buttonStyle} onClick={() => setPreviewOpen(true)}>
        Prepare Teams channel post
      </button>
      {previewOpen && (
        <section role="dialog" aria-label="Teams channel post preview" style={previewWrapStyle}>
          <h4 style={headingStyle}>Safe preview</h4>
          <p style={mutedStyle}>Target alias: {proposal.targetAlias}</p>
          <pre style={previewStyle}>{proposal.safePreview}</pre>
          <p style={mutedStyle}>Content hash: {proposal.contentHash}</p>
          <button type="button" style={buttonStyle} onClick={confirmPost}>
            Confirm server-side post request
          </button>
          {outcome && <p role="status" style={mutedStyle}>{outcome.kind}: {outcome.message}</p>}
        </section>
      )}
      <CardFooter>
        <span>No browser Microsoft transport or channel post is executed.</span>
        <span>Copilot may draft a proposal, but cannot post or confirm.</span>
      </CardFooter>
    </Card>
  );
}

const pillStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.pill, padding: '2px 8px', fontSize: typography.size.xs, color: palette.textMuted };
const buttonStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}`, background: palette.surfaceAlt, color: palette.text, cursor: 'pointer' };
const previewWrapStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.md, padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm };
const headingStyle: React.CSSProperties = { margin: 0, fontSize: typography.size.md };
const previewStyle: React.CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', background: palette.surfaceSubtle, padding: spacing.sm, borderRadius: radius.sm, fontSize: typography.size.xs };
const mutedStyle: React.CSSProperties = { margin: 0, color: palette.textMuted, fontSize: typography.size.sm };
