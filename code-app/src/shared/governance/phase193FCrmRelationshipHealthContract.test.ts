import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCrmRelationshipHealth } from '../../crm/crmRelationshipHealthModel';

/**
 * Phase 193F — relationship health + next actions governance.
 *
 * Pins: no AI / approval-odds / credit-decision language, no fabricated score,
 * deterministic rules-based output, no write/SDK.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const MODEL = read('crm', 'crmRelationshipHealthModel.ts');
const UI = read('crm', 'CrmRelationshipHealthCard.tsx');

describe('no AI / approval / credit decision language', () => {
  it('neither module uses prediction / approval-odds / credit-decision phrasing', () => {
    for (const code of [MODEL, UI]) {
      expect(code).not.toMatch(/approval odds|probability of approval|predicted|AI score|machine learning|credit decision|will be approved|recommend approval/i);
    }
  });

  it('the UI wires no write verb / fetch / SDK', () => {
    expect(UI).not.toMatch(/\b(createRecord|updateRecord|deleteRecord)\b/);
    expect(UI).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(UI).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient/);
  });

  it('reports unknown (not a fabricated score) with no evidence (runtime)', () => {
    const vm = deriveCrmRelationshipHealth({});
    expect(vm.band).toBe('unknown');
    expect(vm.hasSufficientEvidence).toBe(false);
    // Output exposes no numeric "score" field.
    expect(vm).not.toHaveProperty('score');
  });

  it('is deterministic — same input yields equal output', () => {
    const input = { coverageCount: 0, overdueTaskCount: 2, contactCount: 1, activityCount: 0, lastActivityIso: null };
    expect(deriveCrmRelationshipHealth(input)).toEqual(deriveCrmRelationshipHealth(input));
  });

  it('the UI declares no route/router', () => {
    expect(UI).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
  });
});
