import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  deriveOperatorLaunchConsole,
  type CapabilityGateState,
  type OperatorLaunchConsoleInput,
} from './operatorLaunchConsoleModel';

/**
 * Phase 210 / Lane A4 — Operator Launch Console (read-only).
 *
 * One place an operator sees what is on, off, blocked, and why — per capability:
 * gate flags + state, latest smoke result, and rollback instruction. It performs
 * NO write and exposes NO gate-flip control (a governed config write does not
 * exist). No fake "synced/ready" state.
 */

interface Props {
  input: OperatorLaunchConsoleInput;
}

const STATE_VARIANT: Record<CapabilityGateState, SeverityKey> = {
  enabled: 'atRisk', // "on" is the higher-attention state for a control plane
  disabled: 'clear',
  blocked: 'blocked',
};

export function OperatorLaunchConsole({ input }: Props) {
  const s = deriveOperatorLaunchConsole(input);

  return (
    <Card>
      <CardHeader
        title="Operator Launch Console"
        subtitle="Per-capability gate state, latest smoke, and rollback. Observe-only — no gate is flipped here."
        trailing={
          <Badge variant="neutral">
            on {s.counts.enabled} · off {s.counts.disabled} · blocked {s.counts.blocked}
          </Badge>
        }
      />

      <div style={metaStyle} data-testid="operator-launch-console-deployment-commit">
        deployment commit: {s.deploymentCommit ?? 'unknown'}
      </div>

      <div data-testid="operator-launch-console" data-can-flip={String(s.canFlipFromUi)}>
        {s.capabilities.map((c) => (
          <section
            key={c.key}
            style={rowStyle}
            aria-label={c.label}
            data-testid={`capability-${c.key}`}
            data-state={c.state}
            data-category={c.category}
          >
            <div style={headStyle}>
              <span style={nameStyle}>{c.label}</span>
              <Badge variant={STATE_VARIANT[c.state]}>{c.state}</Badge>
            </div>
            <div style={reasonStyle}>{c.reason}</div>

            <div style={flagsStyle} data-testid={`capability-${c.key}-flags`}>
              {c.flags.map((f) => (
                <span key={f.name} style={flagChipStyle} data-flag={f.name} data-flag-value={String(f.value)}>
                  {f.name}={String(f.value)}
                  {f.required ? '*' : ''}
                </span>
              ))}
            </div>

            <div style={metaStyle} data-testid={`capability-${c.key}-smoke`}>
              {c.latestSmoke
                ? `latest smoke: ${c.latestSmoke.outcome}${c.latestSmoke.correlationId ? ` (${c.latestSmoke.correlationId})` : ''}${c.latestSmoke.at ? ` @ ${c.latestSmoke.at}` : ''}`
                : 'latest smoke: none'}
            </div>

            <div style={rollbackStyle} data-testid={`capability-${c.key}-rollback`}>
              rollback: {c.rollback}
            </div>

            <div style={metaStyle} data-testid={`capability-${c.key}-wiring`}>
              route: {c.routeState ?? 'unknown'} · adapter: {c.diState ?? 'unknown'} · auth:{' '}
              {c.actorAuthorizationRequirement ?? 'unknown'} · audit sink: {c.auditSinkState ?? 'unknown'}
            </div>

            <div style={metaStyle} data-testid={`capability-${c.key}-writes`}>
              latest success:{' '}
              {c.latestSuccessfulWrite === undefined
                ? 'not yet correlated'
                : c.latestSuccessfulWrite === null
                  ? 'none recorded'
                  : `${c.latestSuccessfulWrite.at ?? 'unknown time'}${c.latestSuccessfulWrite.actor ? ` (${c.latestSuccessfulWrite.actor})` : ''}`}
              {' · '}
              latest failure:{' '}
              {c.latestFailedWrite === undefined
                ? 'not yet correlated'
                : c.latestFailedWrite === null
                  ? 'none recorded'
                  : `${c.latestFailedWrite.at ?? 'unknown time'}${c.latestFailedWrite.actor ? ` (${c.latestFailedWrite.actor})` : ''}`}
            </div>

            <div style={metaStyle} data-testid={`capability-${c.key}-enablement`}>
              enabled by: {c.enabledBy ?? 'no change-history source for this flag'} · enabled on:{' '}
              {c.enabledOn ?? 'unknown'}
            </div>
          </section>
        ))}
      </div>

      <CardFooter>
        <span data-testid="operator-launch-console-footer">
          Observe-only operator console. No gate is flipped and no write is performed here. Enabling
          a capability is a separate governed/audited action; this view only reports posture.
        </span>
      </CardFooter>
    </Card>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  paddingTop: spacing.sm,
  borderTop: `1px solid ${palette.divider}`,
  marginTop: spacing.sm,
};
const headStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.medium };
const reasonStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const flagsStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, paddingTop: 2 };
const flagChipStyle: CSSProperties = { fontSize: typography.size.xs, fontFamily: 'monospace', color: palette.textSubtle };
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const rollbackStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, fontStyle: 'italic' };
