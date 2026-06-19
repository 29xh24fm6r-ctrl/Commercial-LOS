import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography } from '../shared/theme';
import { deriveCrmAdminControlState, type CrmAdminControlInput } from './crmAdminControlModel';

/**
 * Phase 193I — CRM admin control panel.
 *
 * Read-only operator status: schema-apply gate, persistence gate, environment
 * target, last operation, last failure, partial-success records, recent
 * correlation ids, and the enabled/disabled summary. It reports posture only —
 * it enables nothing and performs no write. No fake recovery status.
 */

interface Props {
  input: CrmAdminControlInput;
}

export function CrmAdminControlPanel({ input }: Props) {
  const s = deriveCrmAdminControlState(input);

  return (
    <Card>
      <CardHeader
        title="CRM Admin Controls"
        subtitle="Gate + environment status. Reports posture only — enables nothing."
        trailing={
          <Badge variant={s.controlSummary === 'all-gates-open' ? 'atRisk' : s.controlSummary === 'gates-closed' ? 'clear' : 'info'}>
            {s.controlSummary}
          </Badge>
        }
      />

      <div data-testid="crm-admin-controls" data-summary={s.controlSummary} data-schema-enabled={String(s.liveSchemaApplyEnabled)} data-persistence-enabled={String(s.livePersistenceEnabled)}>
        <GateBlock testid="crm-admin-schema-gate" label="Schema apply gate" enabled={s.liveSchemaApplyEnabled} blockers={s.schemaApplyGate.blockers} />
        <GateBlock testid="crm-admin-persistence-gate" label="Persistence gate" enabled={s.livePersistenceEnabled} blockers={s.persistenceGate.blockers} />

        <section style={sectionStyle} aria-label="Environment target" data-testid="crm-admin-environment" data-env-present={String(s.environment.present)}>
          <div style={labelStyle}>Environment target</div>
          <div style={detailStyle}>
            {s.environment.present ? (s.environment.label ?? 'present') : 'not confirmed'}
          </div>
        </section>

        <section style={sectionStyle} aria-label="Last operation">
          <div style={labelStyle}>Last operation</div>
          <div style={detailStyle} data-testid="crm-admin-last-operation">
            {s.lastOperation ? `${s.lastOperation.label}: ${s.lastOperation.outcome}${s.lastOperation.correlationId ? ` (${s.lastOperation.correlationId})` : ''}` : 'none'}
          </div>
        </section>

        <section style={sectionStyle} aria-label="Last failure">
          <div style={labelStyle}>Last failure</div>
          <div style={detailStyle} data-testid="crm-admin-last-failure">
            {s.lastFailure ? `${s.lastFailure.label}: ${s.lastFailure.outcome}${s.lastFailure.correlationId ? ` (${s.lastFailure.correlationId})` : ''}` : 'none'}
          </div>
        </section>

        <section style={sectionStyle} aria-label="Partial success records" data-testid="crm-admin-partials">
          <div style={labelStyle}>Partial success records ({s.partialSuccesses.length})</div>
          {s.partialSuccesses.length === 0 ? (
            <div style={mutedStyle}>none</div>
          ) : (
            <ul style={listStyle}>
              {s.partialSuccesses.map((p, i) => (
                <li key={i} style={mutedStyle}>
                  {p.label}: {p.outcome} {p.correlationId ? `(${p.correlationId})` : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={sectionStyle} aria-label="Recent correlation ids">
          <div style={labelStyle}>Recent correlation ids</div>
          <div style={mutedStyle} data-testid="crm-admin-correlation-ids">
            {s.recentCorrelationIds.length === 0 ? 'none' : s.recentCorrelationIds.join(', ')}
          </div>
        </section>
      </div>

      <CardFooter>
        <span data-testid="crm-admin-footer">
          Read-only CRM control status. No live action runs from this panel. To disable a gate, set
          its injected flag to anything other than "true" — every live path then fails closed.
        </span>
      </CardFooter>
    </Card>
  );
}

function GateBlock({ testid, label, enabled, blockers }: { testid: string; label: string; enabled: boolean; blockers: string[] }) {
  return (
    <section style={sectionStyle} aria-label={label} data-testid={testid} data-enabled={String(enabled)}>
      <div style={sectionHeadStyle}>
        <span style={labelStyle}>{label}</span>
        <Badge variant={enabled ? 'atRisk' : 'clear'}>{enabled ? 'open' : 'closed'}</Badge>
      </div>
      {!enabled && blockers.length > 0 && (
        <ul style={listStyle}>
          {blockers.map((b, i) => (
            <li key={i} style={mutedStyle}>
              {b}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs, paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}`, marginTop: spacing.sm };
const sectionHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm };
const labelStyle: CSSProperties = { fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, color: palette.textSubtle, fontWeight: typography.weight.semibold };
const detailStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const mutedStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const listStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
