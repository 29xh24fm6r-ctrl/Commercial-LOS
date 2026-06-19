import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCrmTimeline } from '../../crm/crmActivityTaskModel';

/**
 * Phase 193E — activities/tasks/timeline governance.
 *
 * Pins: no fake history, no email/SMS send, no write verb / SDK in the UI, and
 * live activity logging is gated. The timeline never fabricates entries.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const MODEL = read('crm', 'crmActivityTaskModel.ts');
const UI = read('crm', 'CrmActivityTimeline.tsx');

describe('no outreach / write / fake history', () => {
  it('no email/SMS/outreach send primitive in either module', () => {
    for (const code of [MODEL, UI]) {
      expect(code).not.toMatch(/\b(sendEmail|SendEmailV2|sendSms|twilio)\b|mailto:/i);
    }
  });

  it('the UI wires no direct write verb / POST / fetch / SDK', () => {
    expect(UI).not.toMatch(/\b(createRecord|updateRecord|deleteRecord)\b/);
    expect(UI).not.toMatch(/method:\s*['"](POST|PATCH|DELETE)['"]/);
    expect(UI).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(UI).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient/);
  });

  it('emits no fabricated completion/success copy', () => {
    for (const code of [MODEL, UI]) {
      expect(code).not.toMatch(/task completed successfully|email sent|activity logged successfully/i);
    }
  });

  it('the timeline fabricates no entries (runtime)', () => {
    const vm = deriveCrmTimeline({});
    expect(vm.entries).toEqual([]);
    expect(vm.hasHistory).toBe(false);
    expect(vm.overdueTaskCount).toBe(0);
  });

  it('the UI declares no route/router', () => {
    expect(UI).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
  });
});
