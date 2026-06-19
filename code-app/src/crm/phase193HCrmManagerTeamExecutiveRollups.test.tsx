// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  deriveCrmManagerRollup,
  deriveCrmTeamRollup,
  deriveCrmExecutiveRollup,
  type CrmAccountRollupRecord,
} from './crmRelationshipRollups';
import { CrmRelationshipRollups } from './CrmRollupCards';

/** Phase 193H — manager/team/executive rollups. */

const accounts: CrmAccountRollupRecord[] = [
  { accountId: 'a1', bankerId: 'banker-1', teamId: 'team-1', healthBand: 'at-risk', openTasks: 2, overdueTasks: 1, lastActivityIso: '2025-06-01T00:00:00Z', coverageCount: 0, hasSourceFacts: false },
  { accountId: 'a2', bankerId: 'banker-1', teamId: 'team-1', healthBand: 'healthy', openTasks: 0, overdueTasks: 0, lastActivityIso: '2026-06-01T00:00:00Z', coverageCount: 2, hasSourceFacts: true },
  { accountId: 'a3', bankerId: 'banker-2', teamId: 'team-1', healthBand: 'watch', openTasks: 1, overdueTasks: 0, lastActivityIso: null, coverageCount: 1, hasSourceFacts: true },
];
const now = '2026-06-15T00:00:00Z';

describe('entitlement-before-render', () => {
  it('every rollup fails closed when the viewer is not entitled', () => {
    const input = { accounts, viewerEntitled: false, nowIso: now };
    expect(deriveCrmManagerRollup(input).entitled).toBe(false);
    expect(deriveCrmTeamRollup(input).entitled).toBe(false);
    expect(deriveCrmExecutiveRollup(input).entitled).toBe(false);
    expect(deriveCrmManagerRollup(input).byBanker).toEqual([]);
  });
});

describe('manager rollup aggregates by banker (real counts only)', () => {
  it('groups accounts, counts at-risk, overdue, stale, coverage gaps', () => {
    const r = deriveCrmManagerRollup({ accounts, viewerEntitled: true, nowIso: now });
    const b1 = r.byBanker.find((b) => b.bankerId === 'banker-1')!;
    expect(b1.accountCount).toBe(2);
    expect(b1.health['at-risk']).toBe(1);
    expect(b1.overdueTasks).toBe(1);
    expect(b1.staleAccounts).toBe(1); // a1 last activity 2025-06 vs now 2026-06
    expect(b1.coverageGaps).toBe(1);
  });
});

describe('executive rollup is aggregate-only', () => {
  it('exposes no account-level detail and computes readiness honestly', () => {
    const r = deriveCrmExecutiveRollup({ accounts, viewerEntitled: true, nowIso: now });
    expect(r.totalAccounts).toBe(3);
    expect(r.health['at-risk']).toBe(1);
    expect(r.operationalReadiness).toBe('attention');
    expect(r).not.toHaveProperty('accounts');
    expect(JSON.stringify(r)).not.toContain('a1');
  });

  it('readiness is unknown with zero accounts (no fake KPI)', () => {
    const r = deriveCrmExecutiveRollup({ accounts: [], viewerEntitled: true });
    expect(r.operationalReadiness).toBe('unknown');
    expect(r.coveragePct).toBeNull();
  });
});

describe('rollup rendering', () => {
  it('renders a blocked state when not entitled', () => {
    render(<CrmRelationshipRollups scope="manager" input={{ accounts, viewerEntitled: false }} />);
    expect(screen.getByTestId('crm-rollup-manager').getAttribute('data-entitled')).toBe('false');
    cleanup();
  });
  it('renders the executive aggregate when entitled', () => {
    render(<CrmRelationshipRollups scope="executive" input={{ accounts, viewerEntitled: true, nowIso: now }} />);
    const el = screen.getByTestId('crm-rollup-executive');
    expect(el.getAttribute('data-entitled')).toBe('true');
    expect(el.getAttribute('data-readiness')).toBe('attention');
    cleanup();
  });
});
