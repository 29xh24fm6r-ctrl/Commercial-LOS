import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PRODUCTION_REFERENCES_APPROVED,
  PRODUCTION_STAGE_REFERENCE_SELECTION,
  PRODUCTION_STATUS_REFERENCE_SELECTION,
} from '../../deals/newDealReferenceTargets';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NOT_WIRED } from './platformInventory';

/**
 * Phase 181A-F -- banker New Deal create production-unblock governance.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts', 'phase122-lookup-repair.mjs'), 'utf8');

describe('Phase 181A -- read-only reference inspection/classification mode', () => {
  it('the script exposes --inspect-new-deal-create-references (read-only)', () => {
    expect(SCRIPT).toMatch(/'--inspect-new-deal-create-references'/);
    expect(SCRIPT).toMatch(/flags\.inspectNewDealCreateReferences\s*=\s*true/);
    expect(SCRIPT).toMatch(/async function runInspectNewDealCreateReferences/);
  });

  it('the inspection classifies PRODUCTION-SAFE vs REJECTED and never writes', () => {
    const start = SCRIPT.indexOf('async function classifyReferenceSet');
    const end = SCRIPT.indexOf('// Phase 170K — controlled', start);
    const block = SCRIPT.slice(start, end);
    expect(block).toMatch(/PRODUCTION-SAFE/);
    expect(block).toMatch(/REJECTED \(TEST\/PHASE\/demo/);
    expect(block).toMatch(/isProductionUnsafeReferenceLabel/);
    // Pure GET: no write call shapes in the inspection block.
    expect(block).not.toMatch(/method:\s*'(POST|PATCH|DELETE)'/);
  });

  it('it is in the exclusive-mode set and hardcodes no GUID in the inspection block', () => {
    expect(SCRIPT).toMatch(/flags\.inspectNewDealCreateReferences,/);
    const start = SCRIPT.indexOf('async function runInspectNewDealCreateReferences');
    const block = SCRIPT.slice(start, start + 1500);
    expect(block).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});

describe('Phase 181B -- production resolver profile (code/name, no GUID)', () => {
  const targets = readFileSync(resolve(ROOT, 'src/deals/newDealReferenceTargets.ts'), 'utf8');
  const reader = readFileSync(resolve(ROOT, 'src/deals/newDealReferenceReader.ts'), 'utf8');

  it('production selection is code/name and not yet approved', () => {
    expect(PRODUCTION_STAGE_REFERENCE_SELECTION.code).toBe('INTAKE');
    expect(PRODUCTION_STATUS_REFERENCE_SELECTION.code).toBe('OPEN');
    expect(PRODUCTION_REFERENCES_APPROVED).toBe(false);
  });

  it('no hardcoded Dataverse GUID in the reference target / reader source', () => {
    const guid = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
    expect(targets).not.toMatch(guid);
    expect(reader).not.toMatch(guid);
  });

  it('the production resolver filters TEST/PHASE rows before resolution', () => {
    expect(reader).toMatch(/productionGuardedReader/);
    expect(reader).toMatch(/isProductionUnsafeReferenceLabel/);
    expect(reader).toMatch(/resolveProductionNewDealReferences/);
  });
});

describe('Phase 181C-F -- gates stay closed; public create disabled; NOT_WIRED unchanged', () => {
  it('all three banker create gates remain hard false', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('new-deal-create remains in NOT_WIRED (WIRED_DISABLED until certified)', () => {
    const entry = NOT_WIRED.find((e) => e.id === 'new-deal-create');
    expect(entry).toBeDefined();
    expect(entry!.reason).toMatch(/WIRED_DISABLED/);
  });
});
