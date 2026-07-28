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
    const end = SCRIPT.indexOf('// Phase 181A — guarded seed', start);
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

describe('Phase 181A -- guarded production reference SEED mode', () => {
  const seedBlock = (() => {
    const start = SCRIPT.indexOf('const NEW_DEAL_REFERENCE_SEED_ALLOWED_FIELDS');
    const end = SCRIPT.indexOf('// Phase 170K — controlled', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return SCRIPT.slice(start, end);
  })();

  it('the seed flags are parsed (no "Unknown argument") and in the exclusive-mode set', () => {
    expect(SCRIPT).toMatch(/'--seed-new-deal-create-references'/);
    expect(SCRIPT).toMatch(/'--commit-seed-new-deal-create-references'/);
    expect(SCRIPT).toMatch(/flags\.seedNewDealCreateReferences\s*=\s*true/);
    expect(SCRIPT).toMatch(/flags\.seedNewDealCreateReferences,/);
  });

  it('the commit flag is inert without the seed mode', () => {
    expect(SCRIPT).toMatch(
      /--commit-seed-new-deal-create-references has no effect without --seed-new-deal-create-references/,
    );
  });

  it('help/usage text lists both new flags', () => {
    const help = SCRIPT.slice(SCRIPT.indexOf('function printHelp'));
    expect(help).toMatch(/--inspect-new-deal-create-references/);
    expect(help).toMatch(/--seed-new-deal-create-references/);
    expect(help).toMatch(/--commit-seed-new-deal-create-references/);
  });

  it('dry-run is guarded: POST happens only on commit (after the dry-run return)', () => {
    expect(seedBlock).toMatch(/if \(!doCommit\)/);
    const dryReturnIdx = seedBlock.indexOf("return { action: 'plan' }");
    const postIdx = seedBlock.indexOf('await createNewDealReferenceRow(seed');
    expect(dryReturnIdx).toBeGreaterThan(-1);
    expect(postIdx).toBeGreaterThan(-1);
    expect(dryReturnIdx).toBeLessThan(postIdx);
    // The only POST in the seed block is the reference-row create.
    expect(seedBlock).toMatch(/method:\s*'POST'/);
    expect(seedBlock).not.toMatch(/method:\s*'PATCH'|method:\s*'DELETE'/);
  });

  it('reuses an existing active row; fails closed on multiple / inactive candidates', () => {
    expect(seedBlock).toMatch(/Reusing existing ACTIVE production-safe row/);
    expect(seedBlock).toMatch(/production-safe candidate rows already match/);
    expect(seedBlock).toMatch(/INACTIVE[\s\S]{0,120}Failing closed/);
  });

  it('never mutates TEST/PHASE rows (filters them out as non-candidates)', () => {
    expect(seedBlock).toMatch(/isProductionUnsafeReferenceLabel/);
    expect(seedBlock).toMatch(/TEST\/PHASE/);
  });

  it('payload is allow-listed (name/code/activeflag) and creates only the two reference tables', () => {
    expect(SCRIPT).toMatch(
      /NEW_DEAL_REFERENCE_SEED_ALLOWED_FIELDS = Object\.freeze\(\[\s*'cr664_name',\s*'cr664_code',\s*'cr664_activeflag',/,
    );
    expect(seedBlock).toMatch(/cr664_dealstagereferences/);
    expect(seedBlock).toMatch(/cr664_dealstatusreferences/);
  });

  it('does not create/patch a Loan Deal, enable a gate, or write an audit row', () => {
    expect(seedBlock).not.toMatch(/cr664_loandeals/);
    expect(seedBlock).not.toMatch(/cr664_auditevents/);
    expect(seedBlock).not.toMatch(/ENABLED\s*=\s*true/);
    expect(seedBlock).toMatch(/Banker create gates remain DISABLED/);
    expect(seedBlock).toMatch(/writes no audit|no audit row written/);
  });

  it('hardcodes no GUID and no bypass/suppress/force header in the seed block', () => {
    expect(seedBlock).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
    expect(seedBlock).not.toMatch(/BypassBusinessLogicExecution|SuppressDuplicateDetection|[?&]Force=true/i);
  });
});

describe('Phase 181B -- production resolver profile (code/name, no GUID)', () => {
  const targets = readFileSync(resolve(ROOT, 'src/deals/newDealReferenceTargets.ts'), 'utf8');
  const reader = readFileSync(resolve(ROOT, 'src/deals/newDealReferenceReader.ts'), 'utf8');

  it('production selection is code/name and approved (Phase 182 seed verified)', () => {
    expect(PRODUCTION_STAGE_REFERENCE_SELECTION.code).toBe('INTAKE');
    expect(PRODUCTION_STATUS_REFERENCE_SELECTION.code).toBe('OPEN');
    expect(PRODUCTION_REFERENCES_APPROVED).toBe(true);
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

describe('Phase 181C-F -- legacy public create remains disabled without becoming a product gap', () => {
  it('all three banker create gates remain hard false', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('new-deal-create is absent from current NOT_WIRED because banker create is live', () => {
    const entry = NOT_WIRED.find((e) => e.id === 'new-deal-create');
    expect(entry).toBeUndefined();
  });
});
