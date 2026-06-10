import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type {
  AdminConfigurationApplyPlan,
  AdminConfigurationApplyReadiness,
} from './adminConfigurationApplyTypes';
import type { AdminConfigurationApplyProofResult } from './adminConfigurationTransport';

interface Props {
  readiness: AdminConfigurationApplyReadiness;
  plan?: AdminConfigurationApplyPlan;
  proposalTitle?: string;
  proposalStatus?: string;
  /** Phase 142L — optional fake/offline transport-boundary proof (no live write). */
  transportProof?: AdminConfigurationApplyProofResult;
}

/**
 * Phase 142K — Admin configuration apply preview panel (dry-run-only, read-only).
 *
 * Shows the apply mode, apply readiness, and the dry-run preview / blocked plan
 * steps with redacted before/after summaries. There is NO apply / deploy /
 * publish / activate / execute / save-config / mutate-schema / create-field /
 * register-route / enable-integration / widen-permission / execute-workflow /
 * Dataverse-write / fetch affordance. No changes will be applied.
 */
export function AdminConfigurationApplyPreviewPanel({ readiness, plan, proposalTitle, proposalStatus, transportProof }: Props) {
  return (
    <Card>
      <CardHeader title="Controlled apply preview" subtitle={`Mode: ${readiness.mode.replace(/_/g, ' ')}`} />

      <div style={bannerStyle}>
        Dry-run only — this is a preview of a future, governed change. No changes will be applied. No schema mutation, custom field, route registration, integration enablement, permission widening, workflow execution, Dataverse write, or fetch occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Proposal" value={proposalTitle ?? readiness.proposalId} />
        <Row label="Proposal status" value={(proposalStatus ?? '—').replace(/_/g, ' ')} />
        <Row label="Risk class" value={readiness.riskClass.replace(/_/g, ' ')} />
        <Row label="Apply mode" value={readiness.mode.replace(/_/g, ' ')} />
        <Row label="Apply readiness" value={readiness.status.replace(/_/g, ' ')} />
        <Row label="Valid for apply" value={String(readiness.validForApply)} />
      </dl>

      {plan ? (
        <Section title="Apply plan steps (preview / blocked)">
          <ul style={ulStyle}>
            {plan.steps.map((s, i) => (
              <li key={i} style={s.status === 'blocked' ? blockerItemStyle : itemStyle}>
                {s.label} — <em>{s.stepType.replace(/_/g, ' ')}</em> ({s.status})
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section title="Apply plan">
          <span style={noneStyle}>No preview plan available — {readiness.status.replace(/_/g, ' ')}.</span>
        </Section>
      )}

      {plan && (plan.beforeRedacted || plan.afterRedacted) && (
        <Section title="Before / after (redacted)">
          <span style={itemStyle}>Before: {plan.beforeRedacted ?? '—'}</span>
          <span style={itemStyle}>After: {plan.afterRedacted ?? '—'}</span>
        </Section>
      )}

      {readiness.blockers.length > 0 && (
        <Section title="Blockers">
          <ul style={ulStyle}>
            {readiness.blockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b.message}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Next best action">
        <span style={itemStyle}>{readiness.nextBestAction.label}</span>
      </Section>

      {transportProof && (
        <Section title="Transport boundary proof (fake / offline)">
          <span style={itemStyle}>Status: {transportProof.status.replace(/_/g, ' ')}</span>
          <span style={itemStyle}>Mode: {transportProof.mode.replace(/_/g, ' ')} · Proof only: {String(transportProof.proofOnly)} · Live write performed: {String(transportProof.liveWritePerformed)}</span>
          {transportProof.transportProofId && <span style={itemStyle}>Proof id: {transportProof.transportProofId}</span>}
          {transportProof.rejectedReason && <span style={blockerItemStyle}>Rejected: {transportProof.rejectedReason.replace(/_/g, ' ')}</span>}
          <span style={noneStyle}>{transportProof.message}</span>
        </Section>
      )}

      <div style={footerBannerStyle}>No changes will be applied.</div>

      <CardFooter>
        <span>Generate apply plans; do not apply them. Apply execution is disabled in this phase.</span>
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
const footerBannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, background: palette.blockedBg, padding: spacing.sm, borderRadius: 4, marginTop: spacing.sm, fontWeight: typography.weight.semibold };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
