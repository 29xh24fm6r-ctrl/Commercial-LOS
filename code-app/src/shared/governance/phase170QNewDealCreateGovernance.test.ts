import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NEW_DEAL_CREATE_ADAPTER_ENABLED,
} from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import { NOT_WIRED } from './platformInventory';

/**
 * Phase 170Q -- New Deal create production-enablement governance pins.
 *
 * Static-source guards over the whole New Deal create surface. They prove the
 * controlled-enablement workstream stays production-safe: gates default off, no
 * hardcoded Stage/Status GUIDs, no bypass/suppress/force headers, and no
 * Graph / external HTTP / write-scope expansion in these files.
 */

const ROOT = resolve(__dirname, '..', '..', '..');

const NEW_DEAL_CREATE_FILES = [
  'src/deals/newDealCreateAdapter.ts',
  'src/deals/newDealCreateFeatureFlags.ts',
  'src/deals/newDealCreateEnablement.ts',
  'src/deals/newDealCreateController.ts',
  'src/deals/NewDealCreatePanel.tsx',
] as const;

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Phase 170Q -- gates default disabled', () => {
  it('both gates are hard false by default', () => {
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('new-deal-create remains in NOT_WIRED (WIRED_DISABLED, not live)', () => {
    const entry = NOT_WIRED.find((e) => e.id === 'new-deal-create');
    expect(entry).toBeDefined();
    expect(entry!.reason).toMatch(/WIRED_DISABLED/);
  });
});

describe('Phase 170Q -- no hardcoded Stage/Status GUIDs in New Deal create source', () => {
  for (const rel of NEW_DEAL_CREATE_FILES) {
    it(`${rel} hardcodes no Dataverse record GUID`, () => {
      const src = read(rel);
      expect(src).not.toMatch(
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
      );
    });
  }

  it('the adapter sources Stage/Status binds from the resolver, not a literal', () => {
    const src = read('src/deals/newDealCreateAdapter.ts');
    expect(src).toMatch(/resolution\.stageBind/);
    expect(src).toMatch(/resolution\.statusBind/);
    // No inline cr664_dealstagereferences(<guid>) literal bind.
    expect(src).not.toMatch(/cr664_dealstagereferences\([0-9a-fA-F]/);
    expect(src).not.toMatch(/cr664_dealstatusreferences\([0-9a-fA-F]/);
  });
});

describe('Phase 170Q -- no bypass/suppress/force headers', () => {
  for (const rel of NEW_DEAL_CREATE_FILES) {
    it(`${rel} uses no bypass/suppress/force header`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/BypassBusinessLogicExecution/i);
      expect(src).not.toMatch(/BypassCustomPluginExecution/i);
      expect(src).not.toMatch(/SuppressDuplicateDetection/i);
      expect(src).not.toMatch(/[?&]Force=true/i);
    });
  }
});

describe('Phase 170Q -- no Graph / external HTTP / write-scope expansion', () => {
  for (const rel of NEW_DEAL_CREATE_FILES) {
    it(`${rel} has no Graph / external HTTP and no unrelated write scope`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/graph\.microsoft\.com/i);
      expect(src).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      // No CRM / portfolio / stage-advance / email / borrower writes.
      expect(src).not.toMatch(/cr664_organization|cr664_person|portfolioboarding|stagehistory|SendEmail|borrowerupdate/i);
    });
  }
});

describe('Phase 170Q -- production stays disabled unless explicit rollout config', () => {
  it('the enablement reader requires explicit production rollout approval', async () => {
    const { evaluateNewDealCreateEnablement } = await import(
      '../../deals/newDealCreateEnablement'
    );
    // A production environment with an otherwise-approved config but no
    // productionRolloutApproved stays blocked.
    expect(
      evaluateNewDealCreateEnablement({
        config: { adapterEnabled: true, auditWired: true },
        environment: { name: 'production', isProduction: true },
        authorization: { isAdminOrDev: true, actorSystemUserId: 'sys-1' },
        resolverReady: true,
      }),
    ).toBe('environment_not_allowed');
  });
});
