// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifyPacFetchResult,
  isReachable,
  derivePacTableAccessReadiness,
  CRM_PAC_TABLE_ACCESS,
  PORTFOLIO_PAC_TABLE_ACCESS,
} from './pacTableAccessEvidence';

const ROOT = resolve(__dirname, '..', '..');
const load = (rel: string) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8').replace(/^﻿/, ''));

describe('Phase 248 — PAC fetch classification', () => {
  it('"No results returned" with a clean exit is reachable (PASS)', () => {
    const o = classifyPacFetchResult({ exitCode: 0, output: 'Connected as user\nNo results returned' });
    expect(o).toBe('reachable');
    expect(isReachable(o)).toBe(true);
  });

  it('a missing entity is fail-closed (not reachable)', () => {
    const o = classifyPacFetchResult({
      exitCode: 1,
      output: "Error: The entity with a name = 'cr664_doesnotexist' with namemapping = 'Logical' was not found in the MetadataCache",
    });
    expect(o).toBe('missing_entity');
    expect(isReachable(o)).toBe(false);
  });

  it('an auth error is fail-closed', () => {
    expect(isReachable(classifyPacFetchResult({ exitCode: 1, output: 'Error: 401 Unauthorized' }))).toBe(false);
    expect(classifyPacFetchResult({ exitCode: 1, output: 'Error: not connected. Run pac auth create' })).toBe('auth_error');
  });

  it('a non-zero exit with no recognized cause is fail-closed', () => {
    expect(isReachable(classifyPacFetchResult({ exitCode: 1, output: 'Error: something went wrong' }))).toBe(false);
    expect(classifyPacFetchResult({ exitCode: 2, output: 'partial output' })).toBe('failed');
  });
});

describe('Phase 248 — PAC table access readiness', () => {
  it('records 18/18 table reachability; PAC itself measures no Web API metadata, but the bridge now hydrates from the token-backed verifiers', () => {
    const vm = derivePacTableAccessReadiness();
    expect(vm.totalReachable).toBe(18);
    expect(vm.totalChecked).toBe(18);
    expect(vm.allTablesReachable).toBe(true);
    // PAC reachability remains a distinct, metadata-free dimension.
    expect(vm.webApiMetadataMeasured).toBe(false);
    // Phase 255B: CRM (10/147) + portfolio (219/12) are both full token-backed PASS → the bridge hydrates.
    expect(vm.runtimeHydrated).toBe(true);
  });

  it('the committed counts match the recorded PAC verifier artifacts', () => {
    const crm = load('scripts/dataverse/evidence/pac-table-access.crm.json');
    const pf = load('scripts/dataverse/evidence/pac-table-access.portfolio.json');
    expect(crm.status).toBe('PASS');
    expect(crm.reachable).toBe(CRM_PAC_TABLE_ACCESS.reachable);
    expect(crm.checked).toBe(CRM_PAC_TABLE_ACCESS.checked);
    expect(crm.webApiMetadataMeasured).toBe(false);
    expect(pf.status).toBe('PASS');
    expect(pf.reachable).toBe(PORTFOLIO_PAC_TABLE_ACCESS.reachable);
    expect(pf.checked).toBe(PORTFOLIO_PAC_TABLE_ACCESS.checked);
    expect(pf.webApiMetadataMeasured).toBe(false);
    // Every per-table outcome in the artifact is 'reachable'.
    expect(crm.tables.every((t: { outcome: string }) => t.outcome === 'reachable')).toBe(true);
    expect(pf.tables.every((t: { outcome: string }) => t.outcome === 'reachable')).toBe(true);
  });
});
