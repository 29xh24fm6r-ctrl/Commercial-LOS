import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { CoreBankingLookupKind, CoreBankingLookupResult } from './coreBankingLookupAdapter';

export interface CoreBankingLookupIdentity {
  dealName?: string;
  clientName?: string;
  borrowerLabel?: string;
  lookupKind?: CoreBankingLookupKind;
}

interface Props {
  identity?: CoreBankingLookupIdentity;
  /** Optional locally-generated disabled-seam proof / audit (never a live lookup). */
  result?: CoreBankingLookupResult;
}

/**
 * Phase 142P — Core banking read-only lookup adapter panel (disabled by default, read-only).
 *
 * Shows the disabled core banking lookup seam status and (optionally) the deal /
 * client / borrower summary, lookup kind, and a locally-generated disabled proof.
 * It is an ADAPTER SEAM ONLY: there is NO lookup / search / retrieve / verify /
 * sync / refresh / open-account / transfer / approve / deny / vote affordance, NO
 * form, NO mutation control, NO fetch, NO core call, and NO sample or fake
 * customer/account/balance data. Core banking read-only lookup is not enabled.
 */
export function CoreBankingLookupPanel({ identity, result }: Props) {
  return (
    <Card>
      <CardHeader title="Core Banking Lookup Adapter" subtitle="Adapter seam only — disabled by default" />

      <div style={pillRowStyle}>
        <span style={pillStyle}>Disabled by default</span>
      </div>

      <div style={bannerStyle}>
        Core banking read-only lookup is not enabled. No customer, account, balance, transaction, or relationship data is retrieved, and no external system is changed.
      </div>

      {identity ? (
        <dl style={metaStyle}>
          <Row label="Deal" value={identity.dealName ?? 'unavailable'} />
          <Row label="Client" value={identity.clientName ?? 'unavailable'} />
          <Row label="Borrower" value={identity.borrowerLabel ?? 'unavailable'} />
          <Row label="Lookup kind" value={(identity.lookupKind ?? 'disabled_placeholder').replace(/_/g, ' ')} />
        </dl>
      ) : (
        <div style={emptyStyle}>No deal identity provided — nothing is shown and no lookup is possible.</div>
      )}

      {result && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Disabled seam proof</span>
          <span style={itemStyle}>Status: {result.status} · Provider: {result.provider} · Mode: {result.mode.replace(/_/g, ' ')}</span>
          <span style={itemStyle}>
            Live lookup performed: {String(result.liveLookupPerformed)} · Customer data: {String(result.customerDataRetrieved)} · Account data: {String(result.accountDataRetrieved)} · Balance data: {String(result.balanceDataRetrieved)} · Transaction data: {String(result.transactionDataRetrieved)} · External system changed: {String(result.externalSystemChanged)}
          </span>
          {result.lookupSeamProofId && <span style={itemStyle}>Seam proof id: {result.lookupSeamProofId}</span>}
          {result.rejectedReason && <span style={blockerItemStyle}>Rejected: {result.rejectedReason.replace(/_/g, ' ')}</span>}
          <span style={noneStyle}>{result.message}</span>
        </div>
      )}

      <CardFooter>
        <span>Adapter seam only — no live core call, customer/account/balance/transaction retrieval, money movement, or external change occurs here.</span>
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

const pillRowStyle: CSSProperties = { display: 'flex', gap: spacing.xs };
const pillStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, background: palette.neutralBg, padding: `2px ${spacing.xs}`, borderRadius: 999, fontWeight: typography.weight.semibold };
const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 140, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.xs };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
