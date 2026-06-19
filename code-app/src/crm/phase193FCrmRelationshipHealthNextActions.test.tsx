// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { deriveCrmRelationshipHealth } from './crmRelationshipHealthModel';
import { CrmRelationshipHealthCard } from './CrmRelationshipHealthCard';

/** Phase 193F — relationship health + next actions. */

describe('evidence-based health (no fabrication)', () => {
  it('is unknown with no evidence (never a made-up score)', () => {
    const vm = deriveCrmRelationshipHealth({});
    expect(vm.band).toBe('unknown');
    expect(vm.hasSufficientEvidence).toBe(false);
    expect(vm.missingInputs.length).toBeGreaterThan(0);
  });

  it('is at-risk when there are overdue tasks or no coverage, with source-linked actions', () => {
    const vm = deriveCrmRelationshipHealth({ coverageCount: 0, overdueTaskCount: 2, contactCount: 1, activityCount: 0, lastActivityIso: null });
    expect(vm.band).toBe('at-risk');
    const keys = vm.nextActions.map((a) => a.key);
    expect(keys).toContain('assign-coverage');
    expect(keys).toContain('resolve-overdue');
    expect(vm.nextActions.every((a) => a.reason.length > 0)).toBe(true);
  });

  it('is watch for a provisional account + stale activity', () => {
    const vm = deriveCrmRelationshipHealth({
      hasAccount: true, accountProvisional: true, coverageCount: 1, contactCount: 1,
      activityCount: 1, lastActivityIso: '2025-01-01T00:00:00Z', nowIso: '2026-01-01T00:00:00Z', openTaskCount: 0, overdueTaskCount: 0,
    });
    expect(vm.band).toBe('watch');
    expect(vm.nextActions.map((a) => a.key)).toContain('migrate-account');
  });

  it('is healthy when coverage + contacts + recent activity + no open tasks', () => {
    const vm = deriveCrmRelationshipHealth({
      hasAccount: true, accountProvisional: false, coverageCount: 2, contactCount: 3,
      activityCount: 5, lastActivityIso: '2026-01-01T00:00:00Z', nowIso: '2026-01-15T00:00:00Z', openTaskCount: 0, overdueTaskCount: 0,
    });
    expect(vm.band).toBe('healthy');
    expect(vm.nextActions).toEqual([]);
  });
});

describe('health card rendering', () => {
  it('renders the band, signals, and an insufficient-evidence note when unknown', () => {
    render(<CrmRelationshipHealthCard input={{}} />);
    expect(screen.getByTestId('crm-relationship-health').getAttribute('data-band')).toBe('unknown');
    expect(screen.getByTestId('crm-health-insufficient')).toBeInTheDocument();
    cleanup();
  });

  it('renders next actions when at-risk', () => {
    render(<CrmRelationshipHealthCard input={{ coverageCount: 0, overdueTaskCount: 1, contactCount: 0, activityCount: 0, lastActivityIso: null }} />);
    expect(screen.getByTestId('crm-relationship-health').getAttribute('data-band')).toBe('at-risk');
    expect(screen.getByTestId('crm-health-next-actions')).toBeInTheDocument();
    cleanup();
  });
});
