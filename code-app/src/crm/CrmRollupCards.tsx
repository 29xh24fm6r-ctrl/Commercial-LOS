import { type CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, spacing, typography } from '../shared/theme';
import {
  deriveCrmManagerRollup,
  deriveCrmTeamRollup,
  deriveCrmExecutiveRollup,
  type CrmRollupInput,
} from './crmRelationshipRollups';

/**
 * Phase 193H — CRM manager / team / executive rollup cards.
 *
 * Presentational. Entitlement-before-render: a non-entitled viewer sees a
 * blocked state, never aggregated data. The executive card shows aggregates
 * only (no account-level detail). No fake metrics — every number comes from the
 * pure rollup model over provided records.
 */

type Scope = 'manager' | 'team' | 'executive';

interface Props {
  scope: Scope;
  input: CrmRollupInput;
}

export function CrmRelationshipRollups({ scope, input }: Props) {
  if (!input.viewerEntitled) {
    return (
      <Card>
        <CardHeader title={`CRM ${scope} rollup`} subtitle="Entitlement required" />
        <div style={mutedStyle} data-testid={`crm-rollup-${scope}`} data-entitled="false">
          Not entitled to this CRM rollup. No aggregated data is shown.
        </div>
      </Card>
    );
  }

  if (scope === 'manager') {
    const r = deriveCrmManagerRollup(input);
    return (
      <Card>
        <CardHeader title="Manager CRM rollup" subtitle="Banker coverage, relationship health, overdue tasks, stale warnings" trailing={<Badge variant="neutral">{r.totalAccounts} accounts</Badge>} />
        <div data-testid="crm-rollup-manager" data-entitled="true">
          {r.byBanker.map((b) => (
            <div key={b.bankerId} style={rowStyle} data-banker={b.bankerId}>
              <span style={nameStyle}>{b.bankerId}</span>
              <span style={metaStyle}>
                accounts {b.accountCount} · at-risk {b.health['at-risk']} · watch {b.health.watch} · overdue {b.overdueTasks} · stale {b.staleAccounts} · coverage gaps {b.coverageGaps}
              </span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (scope === 'team') {
    const r = deriveCrmTeamRollup(input);
    return (
      <Card>
        <CardHeader title="Team CRM rollup" subtitle="Team coverage, shared accounts, open work, missing source facts" />
        <div data-testid="crm-rollup-team" data-entitled="true">
          <div style={metaStyle} data-testid="crm-team-totals">
            shared accounts {r.sharedAccounts} · open tasks {r.openTasks} · overdue {r.overdueTasks} · missing source facts {r.missingSourceFacts}
          </div>
          {r.teamCoverage.map((t) => (
            <div key={t.teamId} style={rowStyle} data-team={t.teamId}>
              <span style={nameStyle}>{t.teamId}</span>
              <span style={metaStyle}>accounts {t.accountCount} · coverage gaps {t.coverageGaps}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const r = deriveCrmExecutiveRollup(input);
  return (
    <Card>
      <CardHeader title="Executive CRM summary" subtitle="Aggregate health and operational readiness (no client-level detail)" trailing={<Badge variant={r.operationalReadiness === 'ready' ? 'clear' : r.operationalReadiness === 'attention' ? 'atRisk' : 'neutral'}>{r.operationalReadiness}</Badge>} />
      <div data-testid="crm-rollup-executive" data-entitled="true" data-readiness={r.operationalReadiness}>
        <div style={metaStyle}>
          accounts {r.totalAccounts} · healthy {r.health.healthy} · watch {r.health.watch} · at-risk {r.health['at-risk']} · unknown {r.health.unknown}
        </div>
        <div style={metaStyle}>
          coverage {r.coveragePct === null ? 'n/a' : `${r.coveragePct}%`} · source facts {r.sourceFactPct === null ? 'n/a' : `${r.sourceFactPct}%`} · overdue tasks {r.overdueTasks}
        </div>
      </div>
    </Card>
  );
}

const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'baseline', flexWrap: 'wrap', paddingTop: spacing.xs, borderTop: `1px solid ${palette.divider}` };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.medium, minWidth: 140 };
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const mutedStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontStyle: 'italic' };
