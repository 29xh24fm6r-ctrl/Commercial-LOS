import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveOperatorLaunchConsole } from '../../access/operatorLaunchConsoleModel';

/**
 * Phase 210 / A4 — operator launch console governance.
 *
 * The console is observe-only: it never flips a gate, performs no write, exposes
 * no write control, and fabricates no state.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const MODEL = read('access', 'operatorLaunchConsoleModel.ts');
const UI = read('access', 'OperatorLaunchConsole.tsx');

describe('observe-only safety', () => {
  it('the console exposes no write control / button and no write verb / fetch / SDK', () => {
    expect(UI).not.toMatch(/<button|<input|<form/i);
    expect(UI).not.toMatch(/\b(createRecord|updateRecord|deleteRecord)\b/);
    expect(UI).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(UI).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient/);
  });

  it('emits no fabricated synced/ready success copy', () => {
    for (const code of [MODEL, UI]) {
      expect(code).not.toMatch(/synced successfully|all systems go|everything is ready/i);
    }
  });

  it('never flips a gate from the UI (runtime)', () => {
    const s = deriveOperatorLaunchConsole({ capabilities: [] });
    expect(s.canFlipFromUi).toBe(false);
  });

  it('shows no recorded smoke as null, not a fabricated pass (runtime)', () => {
    const s = deriveOperatorLaunchConsole({
      capabilities: [{ key: 'k', label: 'K', category: 'admin', flags: [{ name: 'f', value: false, required: true }], rollback: 'off' }],
    });
    expect(s.capabilities[0].latestSmoke).toBeNull();
    expect(s.capabilities[0].state).toBe('disabled');
  });

  it('the UI declares no route/router', () => {
    expect(UI).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
  });
});
