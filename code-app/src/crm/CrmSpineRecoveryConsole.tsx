import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  inspectCrmSpineSchema,
  planCrmSpineSchema,
  type CrmLiveTableSnapshot,
} from './crmSalesforceSpineApplyOrchestrator';
import {
  evaluateCrmSpineSchemaApplyGate,
  evaluateCrmSpinePersistenceGate,
  CRM_SPINE_SCHEMA_APPLY_ACK,
  type CrmSpineLiveGateConfig,
  type CrmSpineGateEvaluation,
} from './crmSalesforceSpineLiveGates';

/**
 * Phase 193 — CRM spine OPERATOR RECOVERY CONSOLE (read-mostly cockpit).
 *
 * Supersedes the passive Phase 189L readiness console with an operator action
 * model. It computes inspect + plan (pure) and shows dry-run readiness, live
 * apply eligibility, persistence gate status, the last operation outcome, and
 * blocked reasons. It performs NO write itself: the action buttons invoke
 * optional callback props that the host wires to the gated orchestrator. The
 * "Execute live apply" button stays DISABLED unless the schema-apply gate is
 * satisfied — there are no hidden writes.
 */

export interface CrmRecoveryLastOperation {
  label: string;
  outcome: string;
  blockedReason?: string | null;
  /** Audit correlation id of the last operation, if any. */
  correlationId?: string | null;
  /** Human-readable partial-success breakdown (created/failed/skipped). */
  partialDetails?: string | null;
}

interface Props {
  snapshot?: readonly CrmLiveTableSnapshot[];
  gateConfig?: CrmSpineLiveGateConfig;
  lastOperation?: CrmRecoveryLastOperation;
  onRunInspect?: () => void;
  onGeneratePlan?: () => void;
  onRunDryRunApply?: () => void;
  onPrepareLiveApply?: () => void;
  onExecuteLiveApply?: () => void;
}

const noop = () => {};

export function CrmSpineRecoveryConsole({
  snapshot,
  gateConfig,
  lastOperation,
  onRunInspect = noop,
  onGeneratePlan = noop,
  onRunDryRunApply = noop,
  onPrepareLiveApply = noop,
  onExecuteLiveApply = noop,
}: Props) {
  const report = inspectCrmSpineSchema({ snapshot });
  const plan = planCrmSpineSchema({ report });
  const schemaGate = evaluateCrmSpineSchemaApplyGate(gateConfig);
  const persistenceGate = evaluateCrmSpinePersistenceGate(gateConfig);
  const liveApplyEligible = schemaGate.satisfied;

  return (
    <Card>
      <CardHeader
        title="CRM Spine Recovery Console"
        subtitle="Operator cockpit — inspect / plan / dry-run apply, with gated live apply"
        trailing={
          <Badge
            variant={liveApplyEligible ? 'clear' : 'blocked'}
            aria-label={`Live apply eligibility: ${liveApplyEligible ? 'eligible' : 'blocked'}`}
          >
            {liveApplyEligible ? 'live apply eligible' : 'live apply blocked'}
          </Badge>
        }
      />

      <div data-testid="crm-spine-recovery-console" data-live-apply-eligible={String(liveApplyEligible)}>
        <div style={bannerStyle}>
          Inspect and plan are read-only. Dry-run apply executes nothing. Live apply runs only when
          every hard gate is satisfied and the host wires the executor — there are no hidden writes.
        </div>

        {/* Inspect status */}
        <StatusRow
          testid="crm-recovery-inspect"
          label="Inspect"
          variant="info"
          badge={report.recommendedNextAction}
          detail={`present ${report.tablesPresent.length} · partial ${report.tablesPartial.length} · missing ${report.tablesMissing.length} · conflicts ${report.tableConflicts.length}`}
        />

        {/* Plan status */}
        <StatusRow
          testid="crm-recovery-plan"
          label="Plan"
          variant="info"
          badge={`${plan.steps.length} steps`}
          detail={`tables ${plan.createTableCount} · columns ${plan.createColumnCount} · relationships ${plan.createRelationshipCount}`}
        />

        {/* Dry-run apply readiness */}
        <StatusRow
          testid="crm-recovery-dry-run"
          label="Dry-run apply"
          variant="clear"
          badge="executed: false"
          detail={`${plan.steps.length} step(s) would be simulated; nothing is written.`}
        />

        {/* Live apply eligibility */}
        <GateRow testid="crm-recovery-live-eligibility" label="Live apply eligibility" gate={schemaGate} />

        {/* Persistence gate */}
        <GateRow testid="crm-recovery-persistence-gate" label="Persistence gate" gate={persistenceGate} />

        {/* Acknowledgement requirement */}
        <section style={sectionStyle} aria-label="Acknowledgement requirement" data-testid="crm-recovery-acknowledgement">
          <div style={labelStyle}>Acknowledgement required for live apply</div>
          <div style={detailStyle}>
            Operator must provide the exact acknowledgement <code>{CRM_SPINE_SCHEMA_APPLY_ACK}</code> in addition to
            satisfying all gates above. Without it, live apply stays disabled.
          </div>
        </section>

        {/* Last operation */}
        <section style={sectionStyle} aria-label="Last operation outcome">
          <div style={labelStyle}>Last operation</div>
          {lastOperation ? (
            <div
              style={detailStyle}
              data-testid="crm-recovery-last-operation"
              data-last-outcome={lastOperation.outcome}
              data-correlation-id={lastOperation.correlationId ?? ''}
            >
              <strong>{lastOperation.label}</strong>: {lastOperation.outcome}
              {lastOperation.blockedReason ? ` — ${lastOperation.blockedReason}` : ''}
              {lastOperation.partialDetails ? (
                <div style={mutedStyle} data-testid="crm-recovery-partial-details">
                  Partial success: {lastOperation.partialDetails}
                </div>
              ) : null}
              {lastOperation.correlationId ? (
                <div style={mutedStyle} data-testid="crm-recovery-correlation-id">
                  Audit correlation id: {lastOperation.correlationId}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={mutedStyle} data-testid="crm-recovery-last-operation" data-last-outcome="none">
              No operation has been run in this session.
            </div>
          )}
        </section>

        {/* Operator actions */}
        <section style={actionsStyle} aria-label="Operator actions">
          <button type="button" style={btnStyle} data-testid="crm-recovery-run-inspect" onClick={onRunInspect}>
            Run inspect
          </button>
          <button type="button" style={btnStyle} data-testid="crm-recovery-generate-plan" onClick={onGeneratePlan}>
            Generate plan
          </button>
          <button type="button" style={btnStyle} data-testid="crm-recovery-run-dry-run" onClick={onRunDryRunApply}>
            Run dry-run apply
          </button>
          <button type="button" style={btnStyle} data-testid="crm-recovery-prepare-live" onClick={onPrepareLiveApply}>
            Prepare live apply
          </button>
          <button
            type="button"
            style={liveApplyEligible ? btnDangerStyle : btnDisabledStyle}
            data-testid="crm-recovery-execute-live-apply"
            disabled={!liveApplyEligible}
            aria-disabled={!liveApplyEligible}
            onClick={liveApplyEligible ? onExecuteLiveApply : noop}
          >
            Execute live apply
          </button>
        </section>
      </div>

      <CardFooter>
        <span data-testid="crm-spine-recovery-footer">
          Read-mostly recovery cockpit. No Dataverse write, schema mutation, or live seed occurs
          unless every hard gate and the operator acknowledgement are satisfied and the host wires
          the executor. No fabricated records.
        </span>
      </CardFooter>
    </Card>
  );
}

function StatusRow({
  testid,
  label,
  variant,
  badge,
  detail,
}: {
  testid: string;
  label: string;
  variant: SeverityKey;
  badge: string;
  detail: string;
}) {
  return (
    <section style={sectionStyle} aria-label={label} data-testid={testid}>
      <div style={sectionHeadStyle}>
        <span style={labelStyle}>{label}</span>
        <Badge variant={variant} appearance="outline">
          {badge}
        </Badge>
      </div>
      <div style={detailStyle}>{detail}</div>
    </section>
  );
}

function GateRow({ testid, label, gate }: { testid: string; label: string; gate: CrmSpineGateEvaluation }) {
  return (
    <section style={sectionStyle} aria-label={label} data-testid={testid} data-gate-satisfied={String(gate.satisfied)}>
      <div style={sectionHeadStyle}>
        <span style={labelStyle}>{label}</span>
        <Badge variant={gate.satisfied ? 'clear' : 'blocked'}>
          {gate.satisfied ? 'satisfied' : 'blocked'}
        </Badge>
      </div>
      {gate.blockers.length > 0 && (
        <ul style={listStyle} data-testid={`${testid}-blockers`}>
          {gate.blockers.map((b, i) => (
            <li key={i} style={mutedStyle}>
              {b}
            </li>
          ))}
        </ul>
      )}
    </section>
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
const detailStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const mutedStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const listStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing.sm,
  paddingTop: spacing.sm,
  borderTop: `1px solid ${palette.divider}`,
  marginTop: spacing.sm,
};
const btnStyle: CSSProperties = {
  fontSize: typography.size.sm,
  padding: `${spacing.xs} ${spacing.md}`,
  borderRadius: 4,
  border: `1px solid ${palette.border}`,
  background: palette.surface,
  color: palette.text,
  cursor: 'pointer',
};
const btnDangerStyle: CSSProperties = {
  ...btnStyle,
  border: `1px solid ${palette.primary}`,
  color: palette.primary,
  fontWeight: typography.weight.semibold,
};
const btnDisabledStyle: CSSProperties = {
  ...btnStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};
