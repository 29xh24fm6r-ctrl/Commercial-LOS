import { type CSSProperties, type ReactNode } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type {
  AmlKycCreditBureauPolicyGateResult,
  PolicyGateConsentStatus,
  PolicyGateDomain,
  PolicyGatePermissiblePurposeStatus,
} from './amlKycCreditBureauPolicyGate';

export interface PolicyGateIdentity {
  dealName?: string;
  clientName?: string;
  borrowerLabel?: string;
  requestedDomains?: readonly PolicyGateDomain[];
  consentStatus?: PolicyGateConsentStatus;
  permissiblePurposeStatus?: PolicyGatePermissiblePurposeStatus;
}

interface Props {
  identity?: PolicyGateIdentity;
  /** Optional locally-evaluated policy gate result (never a live pull). */
  result?: AmlKycCreditBureauPolicyGateResult;
}

/**
 * Phase 142Q — AML/KYC and credit bureau policy gate panel (no live pull, read-only).
 *
 * Shows the no-live-pull policy gate status, requested domains, consent /
 * permissible-purpose readiness, and blockers/warnings. It is a POLICY GATE ONLY:
 * there is NO pull-report / run-KYC / run-OFAC / check-sanctions / verify-identity
 * / get-bureau / get-score / approve / deny / vote affordance, NO form, NO
 * mutation control, NO fetch, NO provider call, and NO fake clear / no-match /
 * verified / score / result data. No live AML/KYC or credit bureau pull is enabled.
 */
export function AmlKycCreditBureauPolicyGatePanel({ identity, result }: Props) {
  return (
    <Card>
      <CardHeader title="AML/KYC and Credit Bureau Policy Gate" subtitle="Policy gate only — no live pull" />

      <div style={pillRowStyle}>
        <span style={pillStyle}>No live pull</span>
      </div>

      <div style={bannerStyle}>
        AML/KYC, OFAC, fraud/identity, and credit bureau pulls are not enabled. No reports, scores, sanctions results, identity results, or external data are retrieved, and no external system is changed.
      </div>

      {identity ? (
        <dl style={metaStyle}>
          <Row label="Deal" value={identity.dealName ?? 'unavailable'} />
          <Row label="Client" value={identity.clientName ?? 'unavailable'} />
          <Row label="Borrower" value={identity.borrowerLabel ?? 'unavailable'} />
          <Row label="Requested domains" value={(identity.requestedDomains ?? []).map((d) => d.replace(/_/g, ' ')).join(', ') || 'none'} />
          {identity.consentStatus && <Row label="Consent" value={identity.consentStatus.replace(/_/g, ' ')} />}
          {identity.permissiblePurposeStatus && <Row label="Permissible purpose" value={identity.permissiblePurposeStatus.replace(/_/g, ' ')} />}
        </dl>
      ) : (
        <div style={emptyStyle}>No deal identity provided — nothing is shown and no pull is possible.</div>
      )}

      {result && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Policy gate proof</span>
          <span style={itemStyle}>Status: {result.status.replace(/_/g, ' ')} · Live pull mode: {result.livePullMode.replace(/_/g, ' ')}</span>
          <span style={itemStyle}>
            Live pull performed: {String(result.livePullPerformed)} · Report retrieved: {String(result.reportRetrieved)} · Score retrieved: {String(result.scoreRetrieved)} · External system changed: {String(result.externalSystemChanged)} · Allowed for live pull now: {String(result.allowedForLivePullNow)}
          </span>
          {result.policyGateProofId && <span style={itemStyle}>Gate proof id: {result.policyGateProofId}</span>}
          {result.rejectedReason && <span style={blockerItemStyle}>Rejected: {result.rejectedReason.replace(/_/g, ' ')}</span>}

          {result.blockers.length > 0 && (
            <Subsection title="Blockers">
              <ul style={ulStyle}>
                {result.blockers.map((b) => (
                  <li key={b.code} style={blockerItemStyle}>{b.message}</li>
                ))}
              </ul>
            </Subsection>
          )}
          {result.warnings.length > 0 && (
            <Subsection title="Warnings">
              <ul style={ulStyle}>
                {result.warnings.map((w) => (
                  <li key={w.code} style={warnItemStyle}>{w.message}</li>
                ))}
              </ul>
            </Subsection>
          )}

          <span style={noneStyle}>{result.message}</span>
        </div>
      )}

      <CardFooter>
        <span>Policy gate only — no live AML/KYC, OFAC, fraud/identity, or credit bureau pull, no report/score retrieval, and no external change occurs here.</span>
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

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={subsectionStyle}>
      <span style={subTitleStyle}>{title}</span>
      {children}
    </div>
  );
}

const pillRowStyle: CSSProperties = { display: 'flex', gap: spacing.xs };
const pillStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, background: palette.neutralBg, padding: `2px ${spacing.xs}`, borderRadius: 999, fontWeight: typography.weight.semibold };
const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.xs };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const subsectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.xs };
const subTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const warnItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
