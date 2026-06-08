import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { CrmMaster } from '../shared/crm/crmTypes';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';
import { deriveAnnualReviewBorrowerRequestWorkflow } from './deriveAnnualReviewBorrowerRequestWorkflow';
import type { AnnualReviewRequestFeatureFlagState } from './annualReviewRequestFeatureFlags';

interface Props {
  annualReviewId: string;
  loan: AnnualReviewLoanSnapshot;
  cycle: AnnualReviewCycle;
  master: CrmMaster;
  loanId?: string;
  borrowerOrgId?: string;
  flags?: AnnualReviewRequestFeatureFlagState;
  asOfDate?: string | Date;
}

/**
 * Phase 141M — Annual review borrower request panel (human-approval preview).
 *
 * Read-only: it derives the workflow state from authorized data and shows the
 * recipient decision, masked contact, requested documents, and the draft
 * preview. There is NO send / email / SMS / upload-link / approve-and-send
 * affordance. It loads no data and performs no CRM write.
 */
export function AnnualReviewBorrowerRequestPanel(props: Props) {
  const wf = deriveAnnualReviewBorrowerRequestWorkflow({
    annualReviewId: props.annualReviewId,
    loan: props.loan,
    cycle: props.cycle,
    master: props.master,
    loanId: props.loanId,
    borrowerOrgId: props.borrowerOrgId,
    flags: props.flags,
    asOfDate: props.asOfDate,
  });

  const decision = wf.recipientDecision;
  const recipientLabel =
    decision.decision === 'ready_for_human_approval'
      ? decision.selectedDisplayName ?? 'Authorized recipient'
      : 'No authorized recipient selected';

  return (
    <Card>
      <CardHeader title="Borrower request (human-approval preview)" subtitle={statusLabel(wf.status)} />

      <div style={bannerStyle}>
        Human approval required — nothing is sent. Sending, email, SMS, and upload links are disabled.
      </div>

      <dl style={metaStyle}>
        <Row label="Workflow status" value={statusLabel(wf.status)} />
        <Row label="Recipient" value={recipientLabel} />
        <Row label="Masked contact" value={decision.selectedContactValueMasked ?? 'Not available'} />
        <Row label="Confidence" value={decision.confidence} />
        <Row label="Approval state" value={wf.approvalState} />
      </dl>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Authorization</span>
        {decision.selectedRecipientId ? (
          <ul style={ulStyle}>
            {decision.candidates
              .filter((c) => c.personId === decision.selectedRecipientId)
              .map((c) => (
                <li key={c.candidateId} style={itemStyle}>
                  Financial requests: {yn(c.authorizationFlags.financialRequests)} · Upload links: {yn(c.authorizationFlags.uploadLinks)} · Do-not-contact: {yn(c.communicationPreferences.doNotContact)} · Restricted: {yn(c.communicationPreferences.restrictedUse)}
                </li>
              ))}
          </ul>
        ) : (
          <span style={noneStyle}>No authorized recipient resolved.</span>
        )}
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Requested documents</span>
        {wf.package && wf.package.requestItems.length > 0 ? (
          <ul style={ulStyle}>
            {wf.package.requestItems.map((i) => (
              <li key={i.itemId} style={itemStyle}>
                {i.displayLabel} — due {i.dueDate ?? 'Not set'} ({i.status})
              </li>
            ))}
          </ul>
        ) : (
          <span style={noneStyle}>No requested documents derived.</span>
        )}
      </div>

      {wf.draft && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Draft preview</span>
          <span style={draftSubjectStyle}>{wf.draft.subject}</span>
          <p style={draftBodyStyle}>{wf.draft.bodyPreview}</p>
          <span style={sendDisabledStyle}>{wf.draft.sendDisabledReason}</span>
        </div>
      )}

      {wf.blockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={blockerTitleStyle}>Blockers</span>
          <ul style={ulStyle}>
            {wf.blockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>
                {b.message}
                {b.remediation ? ` — ${b.remediation}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <span>Next: {wf.nextBestAction.label}</span>
      </CardFooter>
    </Card>
  );
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function yn(v: boolean): string {
  return v ? 'Yes' : 'No';
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value ?? 'Not set'}</dd>
    </div>
  );
}

const bannerStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.atRiskFg,
  background: palette.atRiskBg,
  padding: spacing.sm,
  borderRadius: 4,
  marginBottom: spacing.sm,
};
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 140, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const draftSubjectStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const draftBodyStyle: CSSProperties = { margin: `2px 0 0`, fontSize: typography.size.sm, color: palette.text };
const sendDisabledStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRiskFg, fontStyle: 'italic' };
