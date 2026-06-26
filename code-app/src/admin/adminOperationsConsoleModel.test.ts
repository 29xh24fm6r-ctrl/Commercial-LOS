import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ADMIN_CONSOLE_MODULES,
  ADMIN_CONSOLE_SECURITY_DISCLAIMER,
  isAdminConsoleAuthorized,
} from './adminOperationsConsoleModel';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 169A -- Admin Operations Console model + access unit tests.
 */

describe('Phase 169A -- admin console authorization (fails closed)', () => {
  it('authorizes only the admin workspace route', () => {
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.admin)).toBe(true);
  });

  it('denies every non-admin route and missing/empty routes (no admin entitlement)', () => {
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.manager)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.team)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.executive)).toBe(false);
    expect(isAdminConsoleAuthorized(undefined)).toBe(false);
    expect(isAdminConsoleAuthorized('')).toBe(false);
    expect(isAdminConsoleAuthorized('/workspaces/admin-not')).toBe(false);
  });

  it('Phase 204 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â authorizes an admin-entitled user even on a non-admin primary route', () => {
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker, true)).toBe(true);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.manager, true)).toBe(true);
    expect(isAdminConsoleAuthorized(undefined, true)).toBe(true);
  });

  it('Phase 204 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â stays fail-closed when not admin-entitled (default false)', () => {
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker, false)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker)).toBe(false);
  });
});

describe('Phase 229 -- admin console internal CRM and portfolio active', () => {
  it('exposes exactly the five required modules', () => {
    expect(ADMIN_CONSOLE_MODULES.map((m) => m.id)).toEqual([
      'user-access',
      'new-deal-intake',
      'portfolio-boarding',
      'crm-onboarding',
      'security-roles',
    ]);
  });

  it('exposes live management surfaces for user-access, new-deal, CRM, and portfolio (only security is external)', () => {
    const active = ADMIN_CONSOLE_MODULES
      .filter((m) => m.liveWriteEnabledHere)
      .map((m) => m.id)
      .sort();

    expect(active).toEqual(['crm-onboarding', 'new-deal-intake', 'portfolio-boarding', 'user-access']);
  });

  it('every module carries a status line, a scope, a next step, and a manage affordance', () => {
    for (const m of ADMIN_CONSOLE_MODULES) {
      expect(m.statusLine.length).toBeGreaterThan(0);
      expect(m.blocker.length).toBeGreaterThan(0);
      expect(m.nextStep.length).toBeGreaterThan(0);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.manage).toBeTruthy();
    }
  });

  it('uses no stale launch-phase / blocked copy on any module (Phase 257 launched state)', () => {
    for (const m of ADMIN_CONSOLE_MODULES) {
      const text = `${m.statusLine} ${m.blocker} ${m.nextStep}`.toLowerCase();
      expect(text).not.toContain('not yet available');
      expect(text).not.toContain('later phase');
      expect(text).not.toMatch(/phase \d/);
    }
  });

  it('pins New Deal intake as active live banker create (no longer blocked)', () => {
    const newDeal = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'new-deal-intake');
    expect(newDeal?.status).toBe('active');
    expect(newDeal?.statusLine).toMatch(/live for authorized bankers/i);
    expect(newDeal?.nextStep).toMatch(/Stage \(Intake\) and Status \(Open\)/i);
    expect(newDeal?.manage).toEqual({ kind: 'route', route: WORKSPACE_ROUTES.banker, label: 'Open Banker Workspace' });
  });

  it('user-access manages workspace entitlement in-console (governed write)', () => {
    const ua = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'user-access');
    expect(ua?.status).toBe('active');
    expect(ua?.liveWriteEnabledHere).toBe(true);
    expect(ua?.manage).toEqual({ kind: 'in-console', anchor: 'admin-user-access', label: 'Manage workspace entitlement below' });
  });

  it('pins portfolio and CRM as active internal systems with workspace links', () => {
    const portfolio = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'portfolio-boarding');
    const crm = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'crm-onboarding');
    expect(portfolio?.status).toBe('active');
    expect(portfolio?.blocker).toMatch(/internal OGB workflow \/ boarding system/);
    expect(portfolio?.manage).toEqual({ kind: 'route', route: WORKSPACE_ROUTES.manager, label: 'Open Portfolio workspace' });
    expect(crm?.status).toBe('active');
    expect(crm?.blocker).toMatch(/internal OGB CRM relationship system/);
    expect(crm?.manage).toEqual({ kind: 'route', route: WORKSPACE_ROUTES.banker, label: 'Open CRM workspace' });
  });

  it('pins security roles as app-level-only with Power Platform admin center handoff', () => {
    const security = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'security-roles');
    expect(security?.blocker).toMatch(/security roles cannot be granted from here/i);
    expect(security?.nextStep).toMatch(/Power Platform admin center/i);
    expect(ADMIN_CONSOLE_SECURITY_DISCLAIMER).toMatch(/Power Platform admin center/i);
  });
});

describe('Phase 169A -- model introduces no network or write primitives', () => {
  const SRC = readFileSync(resolve(__dirname, 'adminOperationsConsoleModel.ts'), 'utf8');

  it('contains no fetch / XMLHttpRequest / Graph / fake-data primitives', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });
});
