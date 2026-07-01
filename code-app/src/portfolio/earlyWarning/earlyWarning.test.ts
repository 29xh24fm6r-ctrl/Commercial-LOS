import { describe, it, expect } from 'vitest';
import { deriveLoanSignals, deriveEarlyWarningQueue, type EarlyWarningInput } from './earlyWarning';

const NOW = '2026-06-30';
function loan(over: Partial<EarlyWarningInput>): EarlyWarningInput {
  return { loanId: 'L1', now: NOW, ...over };
}

describe('deriveLoanSignals — individual rules', () => {
  it('scores past-due severity into critical at 90+ days', () => {
    expect(deriveLoanSignals(loan({ pastDueDays: 95 }))[0].priority).toBe('critical');
    expect(deriveLoanSignals(loan({ pastDueDays: 35 }))[0].priority).toBe('medium');
    expect(deriveLoanSignals(loan({ pastDueDays: 5 }))).toHaveLength(0);
  });

  it('fires on covenant breach, rating downgrade, and stale financials', () => {
    expect(deriveLoanSignals(loan({ covenantStatus: 'breach' })).some((s) => s.type === 'covenant')).toBe(true);
    expect(deriveLoanSignals(loan({ ratingMigration: 'downgrade' })).some((s) => s.type === 'rating_downgrade')).toBe(true);
    expect(deriveLoanSignals(loan({ overdueFinancials: true })).some((s) => s.type === 'stale_financials')).toBe(true);
    // affirmed rating does not fire.
    expect(deriveLoanSignals(loan({ ratingMigration: 'affirmed' }))).toHaveLength(0);
  });

  it('flags maturity approaching without renewal, and matured-past-due more severely', () => {
    const soon = deriveLoanSignals(loan({ maturityDate: '2026-07-15' }))[0];
    expect(soon.type).toBe('maturity_no_renewal');
    expect(soon.priority).toBe('medium'); // within 30d → score 55
    const matured = deriveLoanSignals(loan({ maturityDate: '2026-06-01' }))[0];
    expect(matured.priority).toBe('high'); // matured, score 80
    // renewal in progress suppresses the signal.
    expect(deriveLoanSignals(loan({ maturityDate: '2026-07-15', renewalInProgress: true }))).toHaveLength(0);
  });

  it('fires deposit-decline and overdraft signals', () => {
    expect(deriveLoanSignals(loan({ ddaBalanceDeclinePct: 30 })).some((s) => s.type === 'dda_decline')).toBe(true);
    expect(deriveLoanSignals(loan({ overdraftCount: 4 })).some((s) => s.type === 'overdraft')).toBe(true);
  });
});

describe('deriveEarlyWarningQueue — dedup, scoring, priority, SLA', () => {
  it('dedups multiple signals into one alert per loan and sums the score', () => {
    const q = deriveEarlyWarningQueue([loan({ loanId: 'A', pastDueDays: 95, covenantStatus: 'breach', ratingMigration: 'downgrade', owner: 'jane' })]);
    expect(q.alerts).toHaveLength(1);
    const a = q.alerts[0];
    expect(a.signals.length).toBe(3);
    expect(a.score).toBe(250); // 100 + 90 + 60
    expect(a.priority).toBe('critical');
    expect(a.slaDays).toBe(3);
    expect(a.dueDate).toBe('2026-07-03');
    expect(a.owner).toBe('jane');
  });

  it('omits loans with no firing signals and ranks critical before high', () => {
    const q = deriveEarlyWarningQueue([
      loan({ loanId: 'clean', pastDueDays: 0 }),
      loan({ loanId: 'high', ratingMigration: 'downgrade' }),
      loan({ loanId: 'crit', pastDueDays: 120 }),
    ]);
    expect(q.alerts.map((a) => a.loanId)).toEqual(['crit', 'high']);
    expect(q.criticalCount).toBe(1);
    expect(q.highCount).toBe(1);
  });

  it('rolls up signal counts by type', () => {
    const q = deriveEarlyWarningQueue([
      loan({ loanId: 'A', pastDueDays: 40 }),
      loan({ loanId: 'B', pastDueDays: 40 }),
      loan({ loanId: 'C', covenantStatus: 'breach' }),
    ]);
    expect(q.signalCount).toBe(3);
    const pastDue = q.byType.find((t) => t.type === 'past_due')!;
    expect(pastDue.count).toBe(2);
  });
});
