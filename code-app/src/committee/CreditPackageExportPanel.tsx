import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { CreditPackageExportResult } from './creditPackageExportAdapter';

export interface CreditPackageExportIdentity {
  dealName?: string;
  clientName?: string;
  readinessStatus?: string;
  evidenceCount?: number;
  blockerCount?: number;
  missingEvidenceCount?: number;
}

interface Props {
  identity?: CreditPackageExportIdentity;
  /** Optional locally-generated disabled-seam proof / audit (never a live export). */
  result?: CreditPackageExportResult;
}

/**
 * Phase 142N — Credit package export adapter panel (disabled by default, read-only).
 *
 * Shows the disabled export-seam status and (optionally) the package identity and
 * a locally-generated disabled proof. It is an ADAPTER SEAM ONLY: there is NO
 * export / send / upload / submit / deliver / approve / deny / vote affordance,
 * NO form, NO mutation control, NO fetch, and NO sample data. Live package export
 * is not enabled.
 */
export function CreditPackageExportPanel({ identity, result }: Props) {
  return (
    <Card>
      <CardHeader title="Package Export Adapter" subtitle="Adapter seam only — disabled by default" />

      <div style={pillRowStyle}>
        <span style={pillStyle}>Disabled by default</span>
      </div>

      <div style={bannerStyle}>
        Live package export is not enabled. No files are uploaded, no emails are sent, and no external system is changed.
      </div>

      {identity ? (
        <dl style={metaStyle}>
          <Row label="Deal" value={identity.dealName ?? 'unavailable'} />
          <Row label="Client" value={identity.clientName ?? 'unavailable'} />
          <Row label="Committee readiness" value={(identity.readinessStatus ?? 'unavailable').replace(/_/g, ' ')} />
          <Row label="Evidence" value={identity.evidenceCount === undefined ? 'unavailable' : String(identity.evidenceCount)} />
          <Row label="Blockers" value={identity.blockerCount === undefined ? 'unavailable' : String(identity.blockerCount)} />
          <Row label="Missing evidence" value={identity.missingEvidenceCount === undefined ? 'unavailable' : String(identity.missingEvidenceCount)} />
        </dl>
      ) : (
        <div style={emptyStyle}>No package identity provided — nothing is shown and no export is possible.</div>
      )}

      {result && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Disabled seam proof</span>
          <span style={itemStyle}>Status: {result.status} · Mode: {result.mode.replace(/_/g, ' ')}</span>
          <span style={itemStyle}>
            Live export performed: {String(result.liveExportPerformed)} · External delivery: {String(result.externalDeliveryPerformed)} · File uploaded: {String(result.fileUploaded)} · Email sent: {String(result.emailSent)}
          </span>
          {result.exportSeamProofId && <span style={itemStyle}>Seam proof id: {result.exportSeamProofId}</span>}
          {result.rejectedReason && <span style={blockerItemStyle}>Rejected: {result.rejectedReason.replace(/_/g, ' ')}</span>}
          <span style={noneStyle}>{result.message}</span>
        </div>
      )}

      <CardFooter>
        <span>Adapter seam only — no live export, upload, email, delivery, or external change occurs here.</span>
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
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const emptyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic', padding: spacing.xs };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
