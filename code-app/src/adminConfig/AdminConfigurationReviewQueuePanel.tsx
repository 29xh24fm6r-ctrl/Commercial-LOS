import { useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AdminConfigurationReviewQueue } from './adminConfigurationTypes';

/** Optional persistence readiness summary (Phase 142J). */
export interface AdminConfigurationPersistenceSummary {
  persistenceMode?: string;
  schemaStatus?: string;
  saveDisabledReason?: string;
  applyDisabledReason?: string;
  nextBestAction?: string;
}

/** Optional controlled-apply workflow summary (Phase 142K). */
export interface AdminConfigurationApplySummary {
  previewReadyCount?: number;
  blockedCount?: number;
  dryRunOnly?: boolean;
  executionDisabledReason?: string;
  nextBestAction?: string;
}

interface Props {
  queue: AdminConfigurationReviewQueue;
  persistence?: AdminConfigurationPersistenceSummary;
  apply?: AdminConfigurationApplySummary;
}

/**
 * Phase 142G — Admin configuration review queue panel (review-only).
 *
 * Shows proposed configuration changes, their risk class, validation blockers,
 * and review status. It is review-only: there is NO apply / deploy / publish /
 * activate / create-field / edit-schema / enable-integration / register-route /
 * save-config / execute-workflow / approve-credit / waive-covenant / send
 * affordance, no callback, no fetch, and no write. Nothing is applied.
 */
export function AdminConfigurationReviewQueuePanel({ queue, persistence, apply }: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const entries = q
    ? queue.proposals.filter((e) => e.proposal.title.toLowerCase().includes(q) || e.proposal.proposalType.includes(q) || e.proposal.status.includes(q))
    : queue.proposals;

  return (
    <Card>
      <CardHeader title="Admin configuration review queue" subtitle={`${queue.visibleProposalCount} visible · ${queue.hiddenProposalCount} hidden`} />

      <div style={bannerStyle}>
        Review-only — proposed configuration changes are not applied. No schema mutation, custom field, route registration, integration enablement, permission change, workflow execution, credit decision, covenant waiver, send, or write occurs here.
      </div>

      <div style={countsStyle}>
        <Count label="Pending" value={queue.pendingCount} />
        <Count label="Blocked unsafe" value={queue.blockedCount} tone="blocked" />
        <Count label="Approved (not applied)" value={queue.approvedNotAppliedCount} />
        <Count label="Rejected" value={queue.rejectedCount} />
        <Count label="High risk" value={queue.highRiskCount} tone="blocked" />
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter proposals…"
        aria-label="Filter proposals"
        style={inputStyle}
      />

      <div style={listStyle}>
        {entries.map((entry) => (
          <details key={entry.proposal.proposalId} style={proposalStyle}>
            <summary style={summaryStyle}>
              <span style={nameStyle}>{entry.proposal.title}</span>
              <span style={metaChipStyle}>{entry.proposal.proposalType}</span>
              <span style={entry.proposal.status === 'blocked_unsafe' ? blockedChipStyle : statusChipStyle}>{entry.proposal.status.replace(/_/g, ' ')}</span>
            </summary>
            <dl style={metaListStyle}>
              <Row label="Target domain" value={entry.proposal.targetDomain.replace(/_/g, ' ')} />
              <Row label="Target key" value={entry.proposal.targetKey ?? '—'} />
              <Row label="Risk class" value={entry.proposal.riskClass.replace(/_/g, ' ')} />
              <Row label="Status" value={entry.proposal.status.replace(/_/g, ' ')} />
              <Row label="Applied in this phase" value={String(entry.proposal.impactSummary.appliedInThisPhase)} />
            </dl>

            {entry.proposal.status === 'approved_not_applied' && (
              <div style={notAppliedBannerStyle}>Approved for future implementation only — not applied.</div>
            )}

            {(entry.validation?.blockers.length ?? 0) > 0 && (
              <div style={sectionStyle}>
                <span style={blockerTitleStyle}>Validation blockers</span>
                <ul style={ulStyle}>
                  {entry.validation!.blockers.map((b, i) => (
                    <li key={i} style={blockerItemStyle}>{b.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {entry.proposal.reviewerNotes && (
              <div style={sectionStyle}>
                <span style={sectionTitleStyle}>Reviewer notes</span>
                <span style={itemStyle}>{entry.proposal.reviewerNotes}</span>
              </div>
            )}
          </details>
        ))}
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Review-only actions (informational)</span>
        <span style={itemStyle}>{queue.reviewerActions.map((a) => a.replace(/_/g, ' ')).join(' · ')}</span>
      </div>

      {persistence && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Persistence readiness (142J)</span>
          <span style={itemStyle}>
            Mode: {persistence.persistenceMode ?? 'disabled'} · Schema: {persistence.schemaStatus ?? 'not ready'}
          </span>
          {persistence.saveDisabledReason && <span style={itemStyle}>Save disabled: {persistence.saveDisabledReason}</span>}
          {persistence.applyDisabledReason && <span style={itemStyle}>Apply disabled: {persistence.applyDisabledReason}</span>}
          {persistence.nextBestAction && <span style={itemStyle}>Next: {persistence.nextBestAction}</span>}
        </div>
      )}

      {apply && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Controlled apply (142K)</span>
          <span style={itemStyle}>
            Preview-ready: {apply.previewReadyCount ?? 0} · Blocked: {apply.blockedCount ?? 0} · Dry-run only: {String(apply.dryRunOnly ?? true)}
          </span>
          {apply.executionDisabledReason && <span style={itemStyle}>Execution disabled: {apply.executionDisabledReason}</span>}
          {apply.nextBestAction && <span style={itemStyle}>Next: {apply.nextBestAction}</span>}
        </div>
      )}

      <CardFooter>
        <span>Review-only — admins may review proposed configuration changes but cannot apply them in this phase.</span>
      </CardFooter>
    </Card>
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

function Count({ label, value, tone }: { label: string; value: number; tone?: 'blocked' }) {
  return (
    <div style={countTileStyle}>
      <span style={tone === 'blocked' ? countValueBlockedStyle : countValueStyle}>{value}</span>
      <span style={countLabelStyle}>{label}</span>
    </div>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const countsStyle: CSSProperties = { display: 'flex', gap: spacing.md, flexWrap: 'wrap' };
const countTileStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 };
const countValueStyle: CSSProperties = { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: palette.text };
const countValueBlockedStyle: CSSProperties = { ...countValueStyle, color: palette.blockedFg };
const countLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label };
const inputStyle: CSSProperties = { padding: spacing.xs, fontSize: typography.size.sm, border: `1px solid ${palette.border}`, borderRadius: 4, color: palette.text, background: palette.surface };
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const proposalStyle: CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 4, padding: spacing.xs };
const summaryStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', cursor: 'pointer' };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const metaChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const statusChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold };
const blockedChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const metaListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: `${spacing.xs} 0` };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 170, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const notAppliedBannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.infoFg, background: palette.infoBg, padding: spacing.xs, borderRadius: 4, marginTop: spacing.xs };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.xs };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
