import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  deriveCrmRelationshipHealth,
  type CrmHealthBand,
  type CrmHealthSeverity,
  type CrmHealthInput,
} from './crmRelationshipHealthModel';

/**
 * Phase 193F — CRM relationship health + next actions card (banker/manager).
 *
 * Presentational. Renders the evidence-based health band, the underlying
 * signals, deterministic source-linked next actions, source facts, and
 * missing-input markers. No AI claims, no lending-decision language, no
 * fabricated score — an `unknown` band is shown honestly when evidence is thin.
 */

interface Props {
  input: CrmHealthInput;
}

const BAND_VARIANT: Record<CrmHealthBand, SeverityKey> = {
  healthy: 'clear',
  watch: 'atRisk',
  'at-risk': 'blocked',
  unknown: 'neutral',
};

const SEVERITY_VARIANT: Record<CrmHealthSeverity, SeverityKey> = {
  ok: 'clear',
  watch: 'atRisk',
  risk: 'blocked',
  unknown: 'neutral',
};

export function CrmRelationshipHealthCard({ input }: Props) {
  const vm = deriveCrmRelationshipHealth(input);

  return (
    <Card>
      <CardHeader
        title="Relationship Health"
        subtitle="Evidence-based, rules-driven — no outcome predictions, no lending decision"
        trailing={
          <Badge variant={BAND_VARIANT[vm.band]} aria-label={`Relationship health: ${vm.band}`}>
            {vm.band}
          </Badge>
        }
      />

      <div data-testid="crm-relationship-health" data-band={vm.band} data-sufficient-evidence={String(vm.hasSufficientEvidence)}>
        {!vm.hasSufficientEvidence && (
          <div style={mutedStyle} data-testid="crm-health-insufficient">
            Not enough evidence to assess health. Band shown as unknown — not estimated.
          </div>
        )}

        <section style={sectionStyle} aria-label="Health signals">
          <div style={labelStyle}>Signals</div>
          <ul style={listStyle}>
            {vm.signals.map((s) => (
              <li key={s.key} style={rowStyle} data-signal={s.key} data-severity={s.severity}>
                <Badge variant={SEVERITY_VARIANT[s.severity]} appearance="outline">
                  {s.severity}
                </Badge>
                <span style={detailStyle}>
                  <strong>{s.label}</strong> — {s.evidence}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionStyle} aria-label="Next actions">
          <div style={labelStyle}>Next actions</div>
          {vm.nextActions.length === 0 ? (
            <div style={mutedStyle} data-testid="crm-health-no-actions">
              No rules-based next actions at this time.
            </div>
          ) : (
            <ol style={olStyle} data-testid="crm-health-next-actions">
              {vm.nextActions.map((a) => (
                <li key={a.key} style={detailStyle} data-action-key={a.key}>
                  {a.action} <span style={mutedInlineStyle}>— {a.reason}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {vm.missingInputs.length > 0 && (
          <section style={sectionStyle} aria-label="Missing inputs" data-testid="crm-health-missing-inputs">
            <div style={labelStyle}>Missing inputs</div>
            <div style={mutedStyle}>{vm.missingInputs.join(', ')}</div>
          </section>
        )}

        {vm.sourceFacts.length > 0 && (
          <section style={sectionStyle} aria-label="Source facts">
            <div style={labelStyle}>Source facts</div>
            <ul style={listStyle}>
              {vm.sourceFacts.map((f, i) => (
                <li key={i} style={mutedStyle}>
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <CardFooter>
        <span data-testid="crm-health-footer">
          Rules-based relationship health. No model score, no outcome odds, no lending decision, no
          borrower communication. Source-linked and evidence-based.
        </span>
      </CardFooter>
    </Card>
  );
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}`, marginTop: spacing.sm };
const labelStyle: CSSProperties = { fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, color: palette.textSubtle, fontWeight: typography.weight.semibold };
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing.xs };
const olStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline' };
const detailStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const mutedStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontStyle: 'italic' };
const mutedInlineStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
