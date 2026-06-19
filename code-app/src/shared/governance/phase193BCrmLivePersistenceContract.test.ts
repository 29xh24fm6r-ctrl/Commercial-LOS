import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { persistCrmSpineRecords } from '../../crm/crmSalesforceSpinePersistenceAdapter';
import { buildCrmSpineAuditPayload } from '../../crm/crmSalesforceSpineAudit';

/**
 * Phase 193B — CRM live persistence adapter + audit governance.
 *
 * Static pins: pure adapter (no SDK/fetch/delete), no fake records/success.
 * Runtime pins: dry-run + ungated-live default to no-write; every record result
 * carries an audit payload with provenance.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const ADAPTER = read('crm', 'crmSalesforceSpinePersistenceAdapter.ts');
const AUDIT = read('crm', 'crmSalesforceSpineAudit.ts');
const SOURCES = [
  { file: 'crmSalesforceSpinePersistenceAdapter.ts', code: ADAPTER },
  { file: 'crmSalesforceSpineAudit.ts', code: AUDIT },
];
const facts = [{ statement: 's', sourceLogicalName: null, sourceRecordId: null }];

describe('no destructive verbs / network / SDK / fake success', () => {
  it('contains no delete and no PublishXml', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/\b(deleteRecord|deleteMultiple)\b/);
      expect(code, file).not.toMatch(/method:\s*['"]DELETE['"]/);
      expect(code, file).not.toMatch(/PublishXml/);
    }
  });
  it('opens no fetch and imports no SDK / generated service', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
      expect(code, file).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient|dataSourcesInfo/);
    }
  });
  it('emits no fabricated sync-success message', () => {
    expect(ADAPTER).not.toMatch(/synced successfully|Salesforce updated|live write completed/i);
  });
});

describe('default behavior is no-write (runtime)', () => {
  it('dry-run executes nothing', async () => {
    const r = await persistCrmSpineRecords({ mode: 'dry-run', requests: [{ entity: 'account', fields: { cr664_name: 'X' }, sourceFacts: facts }], actor: 'op', correlationId: 'g1' });
    expect(r.executed).toBe(false);
    expect(r.results[0].outcome).toBe('dry_run_only');
  });
  it('live blocks with no gate', async () => {
    const r = await persistCrmSpineRecords({ mode: 'live', requests: [{ entity: 'account', fields: { cr664_name: 'X' }, sourceFacts: facts }], actor: 'op', correlationId: 'g2' });
    expect(r.executed).toBe(false);
    expect(r.overallOutcome).toBe('blocked_gate_not_satisfied');
  });
  it('every result carries an audit payload with actor + correlation id + provenance', async () => {
    const r = await persistCrmSpineRecords({ mode: 'dry-run', requests: [{ entity: 'account', fields: { cr664_name: 'X' }, sourceFacts: facts }], actor: 'op', correlationId: 'g3' });
    expect(r.results[0].audit.actor).toBe('op');
    expect(r.results[0].audit.correlationId).toBe('g3');
    expect(r.results[0].audit.sourceFacts.length).toBe(1);
  });
  it('the audit builder is deterministic', () => {
    const a = buildCrmSpineAuditPayload({ correlationId: 'k', actor: 'op', targetEntity: 't', action: 'record-create', outcome: 'created', dryRun: false });
    const b = buildCrmSpineAuditPayload({ correlationId: 'k', actor: 'op', targetEntity: 't', action: 'record-create', outcome: 'created', dryRun: false });
    expect(a).toEqual(b);
  });
});
