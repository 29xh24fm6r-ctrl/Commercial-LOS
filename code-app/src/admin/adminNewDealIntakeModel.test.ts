import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NEW_DEAL_GOVERNED_CREATE_ADAPTER_WIRED,
  NEW_DEAL_INTAKE_BLOCKER,
  NEW_DEAL_INTAKE_FIELDS,
  NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED,
  NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST,
  NEW_DEAL_PRODUCTION_REFERENCES_APPROVED,
  NEW_DEAL_READINESS_TRUTH,
  NEW_DEAL_REFERENCE_INSPECT_COMMAND,
  NEW_DEAL_RESOLVER_READY_IN_TEST,
} from './adminNewDealIntakeModel';
import { NOT_WIRED } from '../shared/governance/platformInventory';

/**
 * Phase 170J -- Admin New Deal Intake truth model (reconciled).
 */

describe('Phase 170J -- New Deal create readiness truth', () => {
  it('records the public + New Deal create as enabled after Phase 227/228A smoke', () => {
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(true);
  });

  it('marks the resolver Ready in TEST but production/adapter pending', () => {
    expect(NEW_DEAL_RESOLVER_READY_IN_TEST).toBe(true);
    expect(NEW_DEAL_PRODUCTION_REFERENCES_APPROVED).toBe(false);
    expect(NEW_DEAL_GOVERNED_CREATE_ADAPTER_WIRED).toBe(false);
  });

  it('the truth table shows Ready(TEST) / Pending / Not wired / Enabled', () => {
    const byLabel = new Map(NEW_DEAL_READINESS_TRUTH.map((t) => [t.label, t]));
    expect(byLabel.get('Stage/Status resolver readiness')?.value).toBe('Ready (TEST)');
    expect(byLabel.get('Stage/Status resolver readiness')?.done).toBe(true);
    expect(byLabel.get('Production reference approval')?.value).toBe('Pending');
    expect(byLabel.get('Production reference approval')?.done).toBe(false);
    expect(byLabel.get('Governed create adapter')?.value).toBe('Not wired');
    expect(byLabel.get('Public + New Deal')?.value).toBe('Enabled');
    expect(byLabel.get('Public + New Deal')?.done).toBe(true);
  });

  it('the blocker no longer claims the data source is missing; it states Ready(TEST) + pending reasons', () => {
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/READY in TEST/i);
    expect(NEW_DEAL_INTAKE_BLOCKER).not.toMatch(/data source registration is missing/i);
    expect(NEW_DEAL_INTAKE_BLOCKER).not.toMatch(/not registered/i);
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/production-approved/i);
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/governed.{0,20}create adapter/i);
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/cr664_dealstagereferences/);
  });

  it('keeps the New Deal create / stage-progression distinction explicit', () => {
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/Advance Stage|stage-progression/i);
  });

  it('+ New Deal create remains in NOT_WIRED', () => {
    expect(NOT_WIRED.some((e) => e.id === 'new-deal-create')).toBe(true);
  });
});

describe('Phase 170J -- required future fields (Stage/Status now resolved in TEST)', () => {
  it('includes the minimum required intake fields', () => {
    const labels = NEW_DEAL_INTAKE_FIELDS.map((f) => f.label);
    for (const required of [
      'Deal Name', 'Client / Borrower', 'Assigned Banker', 'Amount',
      'Stage', 'Status', 'Product Type', 'Loan Structure', 'Pricing',
    ]) {
      expect(labels).toContain(required);
    }
  });

  it('no longer flags Stage/Status as reference-blocked (they resolve in TEST)', () => {
    const stage = NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Stage');
    const status = NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Status');
    expect(stage?.blockedByReference).toBe(false);
    expect(status?.blockedByReference).toBe(false);
    expect(stage?.note).toMatch(/Resolved in TEST/i);
    expect(status?.note).toMatch(/Resolved in TEST/i);
  });

  it('maps Stage/Status to the required odata binds', () => {
    expect(NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Stage')?.field).toBe('cr664_StageReference@odata.bind');
    expect(NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Status')?.field).toBe('cr664_StatusReference@odata.bind');
  });
});

describe('Phase 170J -- enablement checklist (reference/resolver/runtime done)', () => {
  it('marks the reference, resolver, and runtime-readiness steps done', () => {
    const byOrder = new Map(NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.map((s) => [s.order, s.done]));
    // 1 identify, 2 register, 3 typed services, 4 resolver, 5 runtime readiness.
    for (const order of [1, 2, 3, 4, 5]) expect(byOrder.get(order)).toBe(true);
  });

  it('leaves production approval, create adapter, create smoke, and enable pending', () => {
    const byOrder = new Map(NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.map((s) => [s.order, s.done]));
    for (const order of [6, 7, 8, 9]) expect(byOrder.get(order)).toBe(false);
    const titles = NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.map((s) => s.title).join(' | ');
    expect(titles).toMatch(/PRODUCTION Stage\/Status reference rows/i);
    expect(titles).toMatch(/governed, audited create adapter/i);
    expect(titles).toMatch(/controlled create smoke/i);
    expect(titles).toMatch(/Enable \+ New Deal/i);
  });

  it('the resolver step states fail-closed behavior with no hardcoded GUIDs', () => {
    const resolver = NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.find((s) => s.order === 4);
    expect(resolver?.detail).toMatch(/fails? closed/i);
    expect(resolver?.detail).toMatch(/No hardcoded GUIDs/i);
  });

  it('still references the inspect-only metadata command in step 1', () => {
    expect(NEW_DEAL_REFERENCE_INSPECT_COMMAND).toBe(
      'node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references',
    );
    expect(NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST[0]?.detail).toContain(NEW_DEAL_REFERENCE_INSPECT_COMMAND);
  });
});

describe('Phase 170J -- model source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'adminNewDealIntakeModel.ts'), 'utf8');

  it('hardcodes no Dataverse GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('does not fabricate a named Stage/Status label as production truth', () => {
    // "active Stage/Status" is descriptive (the activeflag), allowed.
    // Fabricated NAMED labels presented as real production stages are not.
    expect(SRC).not.toMatch(/initial review|underwriting stage|in progress status/i);
  });

  it('introduces no fetch / XHR / Graph / Dataverse write or create', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(SRC).not.toMatch(/^import .*loandeals/im);
  });
});
