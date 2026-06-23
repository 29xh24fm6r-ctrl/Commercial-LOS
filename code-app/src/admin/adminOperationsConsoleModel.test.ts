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

  it('enables only CRM and portfolio internal management surfaces', () => {
    const active = ADMIN_CONSOLE_MODULES
      .filter((m) => m.liveWriteEnabledHere)
      .map((m) => m.id)
      .sort();

    expect(active).toEqual(['crm-onboarding', 'portfolio-boarding']);
  });

  it('every module carries a status line, a blocker, and a next safe step', () => {
    for (const m of ADMIN_CONSOLE_MODULES) {
      expect(m.statusLine.length).toBeGreaterThan(0);
      expect(m.blocker.length).toBeGreaterThan(0);
      expect(m.nextStep.length).toBeGreaterThan(0);
      expect(m.title.length).toBeGreaterThan(0);
    }
  });

  it('pins New Deal intake as Ready(TEST) but create-blocked pending production approval + adapter (Phase 170J)', () => {
    const newDeal = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'new-deal-intake');
    expect(newDeal?.status).toBe('blocked');
    expect(newDeal?.statusLine).toMatch(/Ready in TEST|Readiness proven in TEST/i);
    expect(newDeal?.blocker).toMatch(/Ready in TEST/i);
    expect(newDeal?.blocker).not.toMatch(/data source registration is missing/i);
    expect(newDeal?.blocker).toMatch(/production-approved/i);
    expect(newDeal?.blocker).toMatch(/Advance Stage|stage-progression/i);
    expect(newDeal?.nextStep).toMatch(/Phase 170J\+/);
  });

  it('pins portfolio and CRM as active internal systems', () => {
    const portfolio = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'portfolio-boarding');
    const crm = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'crm-onboarding');
    expect(portfolio?.status).toBe('active');
    expect(portfolio?.blocker).toMatch(/internal OGB nCino-like workflow\/boarding system/);
    expect(crm?.status).toBe('active');
    expect(crm?.blocker).toMatch(/internal OGB CRM relationship system/);
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
