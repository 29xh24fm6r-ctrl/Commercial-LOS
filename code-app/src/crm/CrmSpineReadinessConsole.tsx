import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';
import { CRM_SPINE_ENTITIES, type CrmSpineEntityKey } from './crmSalesforceSpineModel';
import {
  inspectCrmSpineSchema,
  planCrmSpineSchema,
  runCrmSpineSchemaSeed,
  type CrmLiveTableSnapshot,
  type CrmSpineEntityTableStatus,
} from './crmSalesforceSpineSchemaAdapter';

/**
 * Phase 189L — Salesforce CRM spine LIVE READINESS CONSOLE (read-only).
 *
 * An admin/operator-visible surface that renders the Phase 189K schema adapter's
 * inspect + plan output and shows the seed mode as blocked/disabled/inert. It is
 * PRESENTATIONAL ONLY: it calls the pure adapter in inspect/plan mode, performs
 * no Dataverse IO, executes no schema mutation, wires no write affordance, and
 * fabricates no CRM records. It is not mounted into any route/workspace this
 * phase — it is ready to drop into the existing admin surface.
 */

interface Props {
  /** A read-only live metadata snapshot (e.g. from an inspect API). */
  snapshot?: readonly CrmLiveTableSnapshot[];
}

const STATUS_VARIANT: Record<CrmSpineEntityTableStatus, SeverityKey> = {
  present: 'clear',
  partial: 'atRisk',
  missing: 'blocked',
  conflict: 'blocked',
  'not-applicable': 'neutral',
};

const ENTITY_LABEL: Record<CrmSpineEntityKey, string> = Object.fromEntries(
  CRM_SPINE_ENTITIES.map((e) => [e.key, e.displayName]),
) as Record<CrmSpineEntityKey, string>;

export function CrmSpineReadinessConsole({ snapshot }: Props) {
  // Inspect + plan only. The seed is run WITHOUT a gate, so it stays inert; we
  // render its blocked state to make the disabled posture explicit.
  const report = inspectCrmSpineSchema({ snapshot });
  const plan = planCrmSpineSchema({ report });
  const seed = runCrmSpineSchemaSeed(plan);

  return (
    <Card>
      <CardHeader
        title="CRM Spine Live Readiness"
        subtitle="Read-only inspect/plan of the Salesforce-style CRM spine — no writes, no schema mutation"
        trailing={
          <Badge variant="info" aria-label={`Recommended action: ${report.recommendedNextAction}`}>
            {report.recommendedNextAction}
          </Badge>
        }
      />

      <div
        data-testid="crm-spine-readiness-console"
        data-adapter-version={report.adapterVersion}
        data-recommended-action={report.recommendedNextAction}
      >
        <div style={bannerStyle}>
          Inspect and plan only. Live persistence is disabled and the seed path is inert; nothing
          below writes to Dataverse or mutates schema.
        </div>

        {/* Per-entity table/column/relationship status. */}
        <section style={sectionStyle} aria-label="CRM spine entity status">
          <div style={labelStyle}>Entities ({report.entities.length})</div>
          <ul style={listStyle}>
            {report.entities.map((e) => (
              <li
                key={e.entity}
                style={rowStyle}
                data-testid={`crm-spine-entity-${e.entity}`}
                data-entity-status={e.status}
                data-schema-kind={e.schemaKind}
              >
                <span style={entityNameStyle}>{ENTITY_LABEL[e.entity] ?? e.entity}</span>
                <Badge variant={STATUS_VARIANT[e.status]} appearance="outline">
                  {e.status}
                </Badge>
                <span style={metaStyle}>
                  {e.backingTable ?? 'no schema (derived/meta)'}
                </span>
                {e.schemaKind === 'spine-table' && (
                  <span style={metaStyle} data-entity-counts>
                    columns {e.columnsPresent.length}/{e.columnsExpected} · relationships{' '}
                    {e.relationshipsPresent.length}/{e.relationshipsExpected}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Deterministic plan steps — executes nothing. */}
        <section style={sectionStyle} aria-label="CRM spine schema plan">
          <div style={sectionHeadStyle}>
            <span style={labelStyle}>
              Plan steps ({plan.steps.length}) — tables {plan.createTableCount}, columns{' '}
              {plan.createColumnCount}, relationships {plan.createRelationshipCount}
            </span>
            <Badge variant="info" appearance="outline" aria-label="Plan executed: false">
              executed: {String(plan.executed)}
            </Badge>
          </div>
          <ol
            style={olStyle}
            data-testid="crm-spine-plan"
            data-plan-executed={String(plan.executed)}
            data-plan-step-count={plan.steps.length}
          >
            {plan.steps.map((s) => (
              <li key={s.order} style={stepRowStyle} data-plan-step={s.order} data-step-kind={s.kind}>
                <span style={stepOpStyle}>{s.operation}</span>
                <span style={metaStyle}>{s.detail}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Seed mode — blocked / disabled / inert. */}
        <section style={sectionStyle} aria-label="CRM spine seed mode">
          <div style={sectionHeadStyle}>
            <span style={labelStyle}>Seed mode</span>
            <Badge variant="blocked" aria-label="Seed mode: disabled and inert">
              disabled · inert
            </Badge>
          </div>
          <div
            style={blockedStyle}
            data-testid="crm-spine-seed"
            data-seed-executed={String(seed.executed)}
            data-seed-gate-satisfied={String(seed.gateSatisfied)}
            data-steps-would-run={seed.stepsThatWouldRun}
          >
            {seed.blockedReason}
          </div>
        </section>
      </div>

      <CardFooter>
        <span data-testid="crm-spine-readiness-footer">
          Read-only readiness console — inspect/plan of the CRM spine schema. No Dataverse write, no
          schema mutation, no live seed, no fabricated records. Live persistence stays disabled.
        </span>
      </CardFooter>
    </Card>
  );
}

const bannerStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.textMuted,
  background: palette.panelBg,
  padding: spacing.sm,
  borderRadius: 4,
  marginBottom: spacing.sm,
};
const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  paddingTop: spacing.sm,
  borderTop: `1px solid ${palette.divider}`,
  marginTop: spacing.sm,
};
const sectionHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing.sm,
};
const labelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  color: palette.textSubtle,
  fontWeight: typography.weight.semibold,
};
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};
const olStyle: CSSProperties = {
  margin: 0,
  paddingLeft: spacing.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
const rowStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  alignItems: 'center',
  flexWrap: 'wrap',
};
const stepRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline' };
const entityNameStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.text,
  fontWeight: typography.weight.medium,
  minWidth: 200,
};
const stepOpStyle: CSSProperties = {
  fontSize: typography.size.xs,
  fontFamily: 'monospace',
  color: palette.textMuted,
  minWidth: 150,
};
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const blockedStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.textMuted,
  fontStyle: 'italic',
};
