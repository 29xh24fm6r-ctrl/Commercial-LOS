import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ESignEnvelopeResult } from './eSignEnvelopeAdapter';

export interface ESignEnvelopeIdentity {
  dealName?: string;
  clientName?: string;
  documentLabel?: string;
  signerCount?: number;
  signerLabels?: readonly string[];
}

interface Props {
  identity?: ESignEnvelopeIdentity;
  /** Optional locally-generated disabled-seam proof / audit (never a live envelope). */
  result?: ESignEnvelopeResult;
}

/**
 * Phase 142O — E-sign envelope adapter panel (PandaDoc, disabled by default, read-only).
 *
 * Shows the disabled PandaDoc e-sign seam status and (optionally) the package
 * identity, signer/document summary, and a locally-generated disabled proof. It
 * is an ADAPTER SEAM ONLY: there is NO send / create-envelope / upload / submit /
 * deliver / request-signature / approve / deny / vote affordance, NO form, NO
 * mutation control, NO fetch, NO PandaDoc call, and NO sample data. PandaDoc
 * e-signature sending is not enabled.
 */
export function ESignEnvelopePanel({ identity, result }: Props) {
  return (
    <Card>
      <CardHeader title="E-sign Envelope Adapter" subtitle="Adapter seam only — disabled by default" />

      <div style={pillRowStyle}>
        <span style={providerPillStyle}>PandaDoc</span>
        <span style={pillStyle}>Disabled by default</span>
      </div>

      <div style={bannerStyle}>
        PandaDoc e-signature sending is not enabled. No envelopes are created, no documents are uploaded, no signer emails are sent, and no external system is changed.
      </div>

      {identity ? (
        <dl style={metaStyle}>
          <Row label="Deal" value={identity.dealName ?? 'unavailable'} />
          <Row label="Client" value={identity.clientName ?? 'unavailable'} />
          <Row label="Document" value={identity.documentLabel ?? 'unavailable'} />
          <Row label="Signers" value={identity.signerCount === undefined ? (identity.signerLabels?.length !== undefined ? String(identity.signerLabels.length) : 'unavailable') : String(identity.signerCount)} />
          {identity.signerLabels && identity.signerLabels.length > 0 && (
            <Row label="Signer roles" value={identity.signerLabels.join(', ')} />
          )}
        </dl>
      ) : (
        <div style={emptyStyle}>No package identity provided — nothing is shown and no envelope is possible.</div>
      )}

      {result && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Disabled seam proof</span>
          <span style={itemStyle}>Status: {result.status} · Provider: {result.provider} · Mode: {result.mode.replace(/_/g, ' ')}</span>
          <span style={itemStyle}>
            Live envelope created: {String(result.liveEnvelopeCreated)} · Document uploaded: {String(result.documentUploaded)} · Signer email sent: {String(result.recipientEmailSent)} · Webhook registered: {String(result.webhookRegistered)} · External delivery: {String(result.externalDeliveryPerformed)}
          </span>
          {result.envelopeSeamProofId && <span style={itemStyle}>Seam proof id: {result.envelopeSeamProofId}</span>}
          {result.rejectedReason && <span style={blockerItemStyle}>Rejected: {result.rejectedReason.replace(/_/g, ' ')}</span>}
          <span style={noneStyle}>{result.message}</span>
        </div>
      )}

      <CardFooter>
        <span>Adapter seam only — no live PandaDoc envelope, document upload, signer email, webhook, or external change occurs here.</span>
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

const pillRowStyle: CSSProperties = { display: 'flex', gap: spacing.xs, alignItems: 'center' };
const providerPillStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.primaryFg, background: palette.primaryBg, padding: `2px ${spacing.xs}`, borderRadius: 999, fontWeight: typography.weight.semibold };
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
