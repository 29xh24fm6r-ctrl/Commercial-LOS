import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NEW_DEAL_INTAKE_BLOCKER,
  NEW_DEAL_INTAKE_FIELDS,
  NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED,
  NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST,
} from './adminNewDealIntakeModel';
import { NOT_WIRED } from '../shared/governance/platformInventory';

/**
 * Phase 169C -- Admin New Deal Intake model (Case B, blocker/preview).
 */

describe('Phase 169C -- no live create (Case B)', () => {
  it('NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED is false', () => {
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('the blocker carries the Phase 163 Stage/Status reference gap', () => {
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/Stage\/Status reference data source/i);
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/cr664_StageReference/);
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/cr664_StatusReference/);
    expect(NEW_DEAL_INTAKE_BLOCKER).toMatch(/Phase 163/);
  });

  it('+ New Deal create remains blocked in the platform inventory', () => {
    expect(NOT_WIRED.some((e) => e.id === 'new-deal-create')).toBe(true);
  });
});

describe('Phase 169C -- required future fields', () => {
  it('includes the minimum required intake fields', () => {
    const labels = NEW_DEAL_INTAKE_FIELDS.map((f) => f.label);
    for (const required of [
      'Deal Name',
      'Client / Borrower',
      'Assigned Banker',
      'Amount',
      'Stage',
      'Status',
      'Product Type',
      'Loan Structure',
      'Pricing',
    ]) {
      expect(labels).toContain(required);
    }
  });

  it('flags Stage and Status as blocked-by-reference and others as not', () => {
    const stage = NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Stage');
    const status = NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Status');
    const dealName = NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Deal Name');
    expect(stage?.blockedByReference).toBe(true);
    expect(status?.blockedByReference).toBe(true);
    expect(dealName?.blockedByReference).toBe(false);
  });

  it('maps Stage/Status to the required odata binds', () => {
    expect(NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Stage')?.field).toBe(
      'cr664_StageReference@odata.bind',
    );
    expect(NEW_DEAL_INTAKE_FIELDS.find((f) => f.label === 'Status')?.field).toBe(
      'cr664_StatusReference@odata.bind',
    );
  });
});

describe('Phase 169C -- registration checklist', () => {
  it('has five ordered, all-pending steps', () => {
    expect(NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.map((s) => s.order)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const step of NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST) {
      expect(step.done).toBe(false);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.detail.length).toBeGreaterThan(0);
    }
  });

  it('the resolver step is fail-closed with no hardcoded GUIDs', () => {
    const resolver = NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.find((s) => s.order === 4);
    expect(resolver?.detail).toMatch(/fail closed/i);
    expect(resolver?.detail).toMatch(/No hardcoded GUIDs/i);
  });
});

describe('Phase 169C -- model source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'adminNewDealIntakeModel.ts'), 'utf8');

  it('hardcodes no Dataverse GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('introduces no fetch / XHR / Graph / Dataverse write or create', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    // The model is static data: it imports/instantiates no service. (The
    // doc comment may name Cr664_loandealsService to explain why it is
    // NOT used, so we assert on real write primitives, not the name.)
    expect(SRC).not.toMatch(/^import .*loandeals/im);
  });
});
