import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { IntegrationAdapterDefinition, IntegrationAdapterRequest } from './integrationAdapterTypes';
import { createDisabledIntegrationAdapter } from './createDisabledIntegrationAdapters';

interface Props {
  provider: IntegrationAdapterDefinition;
  request: IntegrationAdapterRequest;
}

/**
 * Phase 142F — Integration request preview panel (read-only, preview only).
 *
 * Shows what a future integration request WOULD require — capability, provider,
 * permission, human approval, permissible purpose, data-sensitivity warning, and
 * the blocked reason — using a redacted safe summary. It renders NO raw PII,
 * SSN/TIN, account number, credit report data, or external URL, and exposes NO
 * submit / run affordance. Nothing executes.
 */
export function IntegrationRequestPreviewPanel({ provider, request }: Props) {
  const adapter = createDisabledIntegrationAdapter(provider);
  const preview = adapter.previewRequest(request);
  const readiness = adapter.getReadiness(request);
  const capability = provider.capabilities.find((c) => c.capability === request.capability);

  return (
    <Card>
      <CardHeader title="Integration request preview" subtitle={`${provider.displayName} — preview only`} />

      <div style={bannerStyle}>
        Preview only — no request is submitted, no external call is made, and no borrower PII is transmitted. Data shown is a redacted safe summary.
      </div>

      <dl style={metaStyle}>
        <Row label="Provider" value={provider.displayName} />
        <Row label="Capability" value={request.capability.replace(/_/g, ' ')} />
        <Row label="Required permission" value={provider.permissionRequirements.map((r) => r.permissionKey).join(', ') || 'none'} />
        <Row label="Required approval" value={provider.humanApproval.required ? `required (${provider.humanApproval.approvalKey ?? 'approval'})` : 'not required'} />
        <Row label="Permissible purpose" value={provider.requiresPermissiblePurpose ? 'required' : 'not required'} />
        <Row label="Data sensitivity" value={(capability?.dataSensitivity ?? 'unknown').replace(/_/g, ' ')} />
        <Row label="Blocked reason" value={(readiness.blockers[0]?.code ?? 'integration_disabled').replace(/_/g, ' ')} />
      </dl>

      {capability && (capability.dataSensitivity === 'borrower_pii' || capability.dataSensitivity === 'credit_report_data' || capability.dataSensitivity === 'tax_data') && (
        <div style={warningStyle}>
          Sensitive data class ({capability.dataSensitivity.replace(/_/g, ' ')}) — external transmission is blocked in this phase and would require explicit future policy approval.
        </div>
      )}

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Safe request summary (redacted)</span>
        <ul style={ulStyle}>
          <li style={itemStyle}>Subject reference present: {String(preview.safeRequestSummary?.subjectRefPresent ?? false)}</li>
          <li style={itemStyle}>Purpose present: {String(preview.safeRequestSummary?.purposePresent ?? false)}</li>
          <li style={itemStyle}>Contains PII: {String(preview.safeRequestSummary?.containsPii ?? false)}</li>
        </ul>
      </div>

      <CardFooter>
        <span>Preview is read-only. Activation requires policy approval, permissible purpose (where applicable), human authorization, and a configured transport.</span>
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

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const warningStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, background: palette.blockedBg, padding: spacing.sm, borderRadius: 4 };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 170, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
