import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCrmAdminControlState } from '../../crm/crmAdminControlModel';

/**
 * Phase 193I — admin controls + runbooks governance. The panel reports posture
 * only (no live buttons, no write/SDK), fails closed by default, and the runbook
 * doc exists with the required sections.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const MODEL = read('crm', 'crmAdminControlModel.ts');
const UI = read('crm', 'CrmAdminControlPanel.tsx');
const DOC_PATH = resolve(here(), '..', 'docs', 'PHASE_193I_CRM_ADMIN_CONTROLS_RUNBOOKS.md');

describe('admin controls safety', () => {
  it('the panel exposes no live action button / write verb / fetch / SDK', () => {
    expect(UI).not.toMatch(/<button/i);
    expect(UI).not.toMatch(/\b(createRecord|updateRecord|deleteRecord)\b/);
    expect(UI).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(UI).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient/);
  });

  it('no secrets committed (no obvious secret literals)', () => {
    for (const code of [MODEL, UI]) {
      expect(code).not.toMatch(/(api[_-]?key|client[_-]?secret|password|bearer)\s*[:=]\s*['"][^'"]+['"]/i);
    }
  });

  it('fails closed by default (runtime)', () => {
    const s = deriveCrmAdminControlState({});
    expect(s.liveSchemaApplyEnabled).toBe(false);
    expect(s.livePersistenceEnabled).toBe(false);
    expect(s.controlSummary).toBe('gates-closed');
  });

  it('the runbook doc exists with inspect/dry-run/live-apply/disable sections', () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const doc = readFileSync(DOC_PATH, 'utf8');
    for (const heading of ['Inspect', 'Dry-run', 'Live apply', 'Disable', 'partial']) {
      expect(doc.toLowerCase()).toContain(heading.toLowerCase());
    }
  });

  it('the UI declares no route/router', () => {
    expect(UI).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
  });
});
