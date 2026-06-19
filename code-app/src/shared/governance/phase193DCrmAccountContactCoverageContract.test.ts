import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCrmAccountSurfaceViewModel } from '../../crm/crmAccountViewModel';

/**
 * Phase 193D — account/contact/coverage surfaces governance.
 *
 * Pins that the surfaces are read-only and fabricate nothing: no write verb /
 * SDK / fetch in the components, no fabricated contacts/titles/company data, and
 * the view-model never invents a value for an absent field.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const VM = read('crm', 'crmAccountViewModel.ts');
const UI = read('crm', 'CrmAccountSurfaces.tsx');

describe('read-only surfaces, no fabrication', () => {
  it('the UI wires no write verb / POST / fetch / SDK', () => {
    expect(UI).not.toMatch(/\b(createRecord|updateRecord|deleteRecord)\b/);
    expect(UI).not.toMatch(/method:\s*['"](POST|PATCH|DELETE)['"]/);
    expect(UI).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(UI).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient/);
  });

  it('neither module hardcodes fake contacts/titles/company placeholders', () => {
    for (const code of [VM, UI]) {
      expect(code).not.toMatch(/const\s+(fakeContacts|sampleContacts|mockAccounts|demoContacts)/i);
      expect(code).not.toMatch(/@(example|acme|test)\.(com|org)/i);
      expect(code).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    }
  });

  it('the view-model marks an absent field missing rather than inventing it (runtime)', () => {
    const vm = deriveCrmAccountSurfaceViewModel({ account: null });
    expect(vm.hasAccount).toBe(false);
    expect(vm.contacts).toEqual([]);
    expect(vm.coverage).toEqual([]);
    // No record collections are fabricated on the output.
    expect(vm.missingSections).toContain('contacts');
  });

  it('the UI declares no route/router', () => {
    expect(UI).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
  });
});
