import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { WorkflowRouteDerivationResult } from './workflowRoutingConfigTypes';
import type { WorkflowRoutingReadinessResult } from './deriveWorkflowRoutingReadiness';

interface Props {
  route: WorkflowRouteDerivationResult;
  readiness?: WorkflowRoutingReadinessResult;
}

/**
 * Phase 142C — Workflow routing panel (read-only).
 *
 * Shows the derived route, stage sequence, credit-committee requirement,
 * blockers, and next best actions. Decision support only — there is NO change-
 * route / approve / decline / submit-to-committee / record-vote / waive-covenant
 * / create-task / update-stage / send-request / upload-link / write / fetch
 * affordance.
 */
export function WorkflowRoutingPanel({ route, readiness }: Props) {
  const committee = route.creditCommittee;
  return (
    <Card>
      <CardHeader title="Workflow route (derived)" subtitle={route.routeName} />

      <div style={bannerStyle}>
        Read-only decision support — no route change, approval, committee submission, vote, covenant waiver, task, stage update, or send occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Route" value={route.routeName} />
        <Row label="Status" value={route.routeStatus.replace(/_/g, ' ')} />
        <Row label="Confidence" value={route.confidence} />
        <Row label="Credit committee" value={committee.committeeRequired ? committee.committeeType.replace(/_/g, ' ') : 'not required'} />
        <Row label="Current stage" value={route.currentStageKey ?? 'not set'} />
        <Row label="Next stage" value={route.nextStageKey ?? 'not set'} />
        {readiness && <Row label="Readiness" value={readiness.readinessStatus.replace(/_/g, ' ')} />}
      </dl>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Stages</span>
        <ol style={olStyle}>
          {route.stages.map((s) => (
            <li key={s.stageKey} style={itemStyle}>{s.label}</li>
          ))}
        </ol>
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Approval checkpoints (findings, not approvals)</span>
        {route.approvalCheckpoints.length === 0 ? (
          <span style={noneStyle}>None.</span>
        ) : (
          <ul style={ulStyle}>
            {route.approvalCheckpoints.map((c) => (
              <li key={c.checkpointKey} style={itemStyle}>{c.label} ({c.requiredRole})</li>
            ))}
          </ul>
        )}
      </div>

      {committee.committeeRequired && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Committee materials</span>
          <span style={itemStyle}>Required: {committee.requiredMaterials.join(', ') || 'none'}</span>
          <span style={committee.missingMaterials.length > 0 ? blockerItemStyle : itemStyle}>
            Missing: {committee.missingMaterials.join(', ') || 'none'}
          </span>
          <span style={metaStyle2}>Voting: disabled · Approval: disabled</span>
        </div>
      )}

      {route.blockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={blockerTitleStyle}>Blockers</span>
          <ul style={ulStyle}>
            {route.blockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Next best actions</span>
        <ul style={ulStyle}>
          {route.nextBestActions.map((a) => (
            <li key={a.code} style={itemStyle}>{a.label}</li>
          ))}
        </ul>
      </div>

      <CardFooter>
        <span>Decision support only — never mutates workflow state and never approves credit.</span>
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

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4, marginBottom: spacing.sm };
const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const metaStyle2: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 140, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const olStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
