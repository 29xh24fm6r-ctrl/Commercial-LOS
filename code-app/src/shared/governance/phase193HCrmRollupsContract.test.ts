import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCrmExecutiveRollup, deriveCrmManagerRollup } from '../../crm/crmRelationshipRollups';

/**
 * Phase 193H — CRM rollups governance. Entitlement-before-render, no fake KPIs,
 * no client-level leakage in the executive aggregate, no write/SDK.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const MODEL = read('crm', 'crmRelationshipRollups.ts');
const UI = read('crm', 'CrmRollupCards.tsx');

describe('rollup safety', () => {
  it('the UI wires no write verb / fetch / SDK', () => {
    expect(UI).not.toMatch(/\b(createRecord|updateRecord|deleteRecord)\b/);
    expect(UI).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(UI).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient/);
  });

  it('fails closed when not entitled (runtime)', () => {
    const r = deriveCrmManagerRollup({ accounts: [{ accountId: 'a', bankerId: 'b', teamId: 't', healthBand: 'healthy', openTasks: 0, overdueTasks: 0, lastActivityIso: null, coverageCount: 1, hasSourceFacts: true }], viewerEntitled: false });
    expect(r.entitled).toBe(false);
    expect(r.byBanker).toEqual([]);
  });

  it('the executive rollup exposes aggregates only (no account-level leakage)', () => {
    const r = deriveCrmExecutiveRollup({ accounts: [{ accountId: 'secret-acct', bankerId: 'b', teamId: 't', healthBand: 'healthy', openTasks: 0, overdueTasks: 0, lastActivityIso: null, coverageCount: 1, hasSourceFacts: true }], viewerEntitled: true });
    expect(JSON.stringify(r)).not.toContain('secret-acct');
    expect(r).not.toHaveProperty('accounts');
  });

  it('produces no fake KPI for empty input', () => {
    const r = deriveCrmExecutiveRollup({ accounts: [], viewerEntitled: true });
    expect(r.totalAccounts).toBe(0);
    expect(r.operationalReadiness).toBe('unknown');
    expect(r.coveragePct).toBeNull();
  });

  it('the UI declares no route/router', () => {
    expect(UI).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
    expect(MODEL).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
  });
});
