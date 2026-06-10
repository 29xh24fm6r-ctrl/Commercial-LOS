import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { CrmDryRunWritebackCommandViewModel } from './crmDryRunWritebackCommandViewModel';

interface Props {
  viewModel: CrmDryRunWritebackCommandViewModel;
}

export function CrmDryRunWritebackCommandCenter({ viewModel: vm }: Props) {
  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader title={vm.title} subtitle={vm.subtitle} />
        <p style={safetyStyle}>{vm.safetyCopy}</p>
      </Card>

      <Card>
        <CardHeader title="Policy Gate" />
        <Row label="Policy gate status" value={vm.policyGateStatus} />
        <Row label="Allowlist status" value={vm.allowlistStatus} />
        <Row label="Dry-run proof" value={vm.dryRunProofSummary} />
        <Row label="Audit summary" value={vm.auditSummary} />
      </Card>

      {vm.blockedFields.length > 0 && (
        <Card accentColor={palette.blocked}>
          <CardHeader title={`Blocked Fields (${vm.blockedFields.length})`} />
          {vm.blockedFields.map((f) => (
            <Row key={f.fieldKey} label={`${f.label} (${f.provider})`} value={f.blockedReason ?? 'Blocked'} />
          ))}
        </Card>
      )}

      {vm.eligibleFutureFields.length > 0 && (
        <Card>
          <CardHeader title={`Eligible Future Fields (${vm.eligibleFutureFields.length})`} />
          {vm.eligibleFutureFields.map((f) => (
            <Row key={f.fieldKey} label={`${f.label} (${f.provider})`} value="Eligible for dry-run" />
          ))}
        </Card>
      )}

      {vm.rollbackPrerequisites.length > 0 && (
        <Card>
          <CardHeader title="Rollback Prerequisites" />
          <ul style={listStyle}>
            {vm.rollbackPrerequisites.map((r, i) => (
              <li key={i} style={listItemStyle}>{r}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Next Safe Action" />
        <p style={nextActionStyle}>{vm.nextSafeAction}</p>
        <CardFooter>
          <span>Dry-run only. No live Salesforce or nCino writes. No sync now. No push now.</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={rowValueStyle}>{value}</span>
    </div>
  );
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const rowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const rowLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold };
const rowValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const safetyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const nextActionStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const listStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg };
const listItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
