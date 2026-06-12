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

  it('denies every non-admin route and missing/empty routes', () => {
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.manager)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.team)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.executive)).toBe(false);
    expect(isAdminConsoleAuthorized(undefined)).toBe(false);
    expect(isAdminConsoleAuthorized('')).toBe(false);
    expect(isAdminConsoleAuthorized('/workspaces/admin-not')).toBe(false);
  });
});

describe('Phase 169A -- admin console modules are honest and write-free', () => {
  it('exposes exactly the five required modules', () => {
    expect(ADMIN_CONSOLE_MODULES.map((m) => m.id)).toEqual([
      'user-access',
      'new-deal-intake',
      'portfolio-boarding',
      'crm-onboarding',
      'security-roles',
    ]);
  });

  it('enables NO live write surface in this phase', () => {
    for (const m of ADMIN_CONSOLE_MODULES) {
      expect(m.liveWriteEnabledHere, `${m.id} must not enable a live write`).toBe(false);
    }
  });

  it('every module carries a status line, a blocker, and a next safe step', () => {
    for (const m of ADMIN_CONSOLE_MODULES) {
      expect(m.statusLine.length).toBeGreaterThan(0);
      expect(m.blocker.length).toBeGreaterThan(0);
      expect(m.nextStep.length).toBeGreaterThan(0);
      expect(m.title.length).toBeGreaterThan(0);
    }
  });

  it('pins New Deal intake as blocked by the Stage/Status reference gap (Phase 163)', () => {
    const newDeal = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'new-deal-intake');
    expect(newDeal?.status).toBe('blocked');
    expect(newDeal?.blocker).toMatch(/Stage\/Status reference/i);
    expect(newDeal?.nextStep).toMatch(/Phase 163/);
  });

  it('pins portfolio and CRM as adapter-disabled by default', () => {
    const portfolio = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'portfolio-boarding');
    const crm = ADMIN_CONSOLE_MODULES.find((m) => m.id === 'crm-onboarding');
    expect(portfolio?.status).toBe('disabled');
    expect(portfolio?.blocker).toMatch(/PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED/);
    expect(crm?.status).toBe('disabled');
    expect(crm?.blocker).toMatch(/CRM_LIVE_PERSISTENCE_ENABLED/);
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
