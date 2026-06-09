import { useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { IntegrationAdapterDefinition } from './integrationAdapterTypes';
import { INTEGRATION_PROVIDER_REGISTRY } from './integrationProviderRegistry';
import type { IntegrationReadinessResult } from './deriveIntegrationReadiness';

interface Props {
  providers?: readonly IntegrationAdapterDefinition[];
  readiness?: IntegrationReadinessResult;
}

/**
 * Phase 142F — Integration adapter registry panel (read-only).
 *
 * Shows each provider's category, mode, risk class, data sensitivity,
 * capabilities, permission + human-approval requirements, and (disabled)
 * readiness. There is NO configure / enable / run / pull / score / lookup /
 * post / disburse / send / generate / submit affordance — every provider is
 * disabled, and no external call, fetch, or write occurs here.
 */
export function IntegrationAdapterRegistryPanel({ providers = INTEGRATION_PROVIDER_REGISTRY, readiness }: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? providers.filter((p) => p.displayName.toLowerCase().includes(q) || p.category.includes(q) || p.providerKey.includes(q))
    : providers;

  const readinessByKey = new Map((readiness?.providerReadiness ?? []).map((e) => [e.providerKey, e]));

  return (
    <Card>
      <CardHeader title="Integration adapter registry" subtitle="All providers disabled — read-only" />

      <div style={bannerStyle}>
        Read-only integration registry — no provider is enabled. No external call, fetch, AML run, credit pull, score, core lookup, payment posting, disbursement, e-sign send, upload-link generation, or write occurs here.
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter providers…"
        aria-label="Filter providers"
        style={inputStyle}
      />

      <div style={listStyle}>
        {filtered.map((p) => {
          const entry = readinessByKey.get(p.providerKey);
          return (
            <details key={p.providerKey} style={providerStyle}>
              <summary style={summaryStyle}>
                <span style={nameStyle}>{p.displayName}</span>
                <span style={metaChipStyle}>{p.category}</span>
                <span style={modeChipStyle}>{p.mode}</span>
              </summary>
              <dl style={metaListStyle}>
                <Row label="Mode" value={p.mode} />
                <Row label="Risk class" value={p.riskClass} />
                <Row label="Data sensitivity" value={p.dataSensitivities.join(', ')} />
                <Row label="Permissions" value={p.permissionRequirements.map((r) => r.permissionKey).join(', ') || 'none'} />
                <Row label="Human approval" value={p.humanApproval.required ? `required (${p.humanApproval.approvalKey ?? 'approval'})` : 'not required'} />
                <Row label="Permissible purpose" value={p.requiresPermissiblePurpose ? 'required' : 'not required'} />
                <Row label="Readiness" value={(entry?.readiness.status ?? 'disabled_not_configured').replace(/_/g, ' ')} />
              </dl>

              <div style={sectionStyle}>
                <span style={sectionTitleStyle}>Capabilities</span>
                <ul style={ulStyle}>
                  {p.capabilities.map((c) => (
                    <li key={c.capability} style={itemStyle}>{c.label} — {c.dataSensitivity.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </div>

              {entry && entry.readiness.blockers.length > 0 && (
                <div style={sectionStyle}>
                  <span style={blockerTitleStyle}>Blockers</span>
                  <ul style={ulStyle}>
                    {entry.readiness.blockers.map((b, i) => (
                      <li key={i} style={blockerItemStyle}>{b.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {entry && (
                <div style={sectionStyle}>
                  <span style={sectionTitleStyle}>Next best action</span>
                  <span style={itemStyle}>{entry.readiness.nextBestAction.label}</span>
                </div>
              )}
            </details>
          );
        })}
      </div>

      <CardFooter>
        <span>Registry and adapter seams only — no external integration is live. Future activation requires policy approval, transport configuration, and human authorization.</span>
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
const inputStyle: CSSProperties = { padding: spacing.xs, fontSize: typography.size.sm, border: `1px solid ${palette.border}`, borderRadius: 4, color: palette.text, background: palette.surface };
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const providerStyle: CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 4, padding: spacing.xs };
const summaryStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', cursor: 'pointer' };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const metaChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const modeChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const metaListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: `${spacing.xs} 0` };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.xs };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
