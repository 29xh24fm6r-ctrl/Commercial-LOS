import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ServicingLifecycleSnapshot } from './servicingLifecycleTypes';

interface Props {
  snapshot: ServicingLifecycleSnapshot;
}

/**
 * Phase 142E — Servicing lifecycle panel (read-only).
 *
 * Shows the lifecycle stage/health, obligations, collateral / insurance /
 * tickler / covenant-reporting / maturity statuses, exceptions, blockers, and
 * next best actions. There is NO post-payment / disburse / book / close /
 * transfer / repayment-schedule / task / tickler-update / waive / approve /
 * send / upload-link / write / fetch affordance.
 */
export function ServicingLifecyclePanel({ snapshot }: Props) {
  return (
    <Card>
      <CardHeader title="Servicing lifecycle" subtitle={snapshot.lifecycleStage.replace(/_/g, ' ')} />

      <div style={bannerStyle}>
        Read-only servicing decision support — no payment posting, disbursement, accounting, booking, closing, transfer, schedule change, task, tickler update, waiver, approval, or send occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Stage" value={snapshot.lifecycleStage.replace(/_/g, ' ')} />
        <Row label="Health" value={snapshot.lifecycleStatus.replace(/_/g, ' ')} />
        <Row label="Collateral" value={snapshot.collateralSecurityStatus.status.replace(/_/g, ' ')} />
        <Row label="Insurance" value={snapshot.insuranceStatus.status.replace(/_/g, ' ')} />
        <Row label="Ticklers" value={snapshot.ticklerStatus.status.replace(/_/g, ' ')} />
        <Row label="Covenant / reporting" value={snapshot.covenantReportingStatus.status.replace(/_/g, ' ')} />
        <Row label="Maturity / renewal" value={snapshot.maturityRenewalStatus.status.replace(/_/g, ' ')} />
      </dl>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Obligations</span>
        {snapshot.obligations.length === 0 ? (
          <span style={noneStyle}>No obligations derived.</span>
        ) : (
          <ul style={ulStyle}>
            {snapshot.obligations.map((o) => (
              <li key={o.obligationId} style={o.status === 'overdue' || o.status === 'missing_evidence' ? blockerItemStyle : itemStyle}>
                {o.label}: {o.status.replace(/_/g, ' ')} ({o.source.replace(/_/g, ' ')})
              </li>
            ))}
          </ul>
        )}
      </div>

      {snapshot.blockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={blockerTitleStyle}>Blockers</span>
          <ul style={ulStyle}>
            {snapshot.blockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Next best actions</span>
        <ul style={ulStyle}>
          {snapshot.nextBestActions.map((a) => (
            <li key={a.code} style={itemStyle}>{a.label}</li>
          ))}
        </ul>
      </div>

      <CardFooter>
        <span>Operational decision support only — never posts transactions, books loans, moves money, or mutates live records.</span>
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

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4, marginBottom: spacing.sm };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 150, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
