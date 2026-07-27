import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Mock the generated services the adapter (and its reference reader) import so
// the @microsoft/power-apps SDK never loads in the test environment. These
// mocks are never invoked: every test injects its own create/audit deps, and
// the live-deps test asserts refusal BEFORE any service call.
vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealstatusreferencesService', () => ({
  Cr664_dealstatusreferencesService: { getAll: vi.fn() },
}));

import {
  createGovernedNewDeal,
  buildLiveNewDealCreateDeps,
  NEW_DEAL_CREATE_ALLOWED_FIELDS,
  type GovernedNewDealCreateDeps,
  type GovernedNewDealCreateInput,
  type NewDealCreatePayload,
  type EmitNewDealAuditInput,
} from './newDealCreateAdapter';
import {
  NEW_DEAL_CREATE_ADAPTER_ENABLED,
  isNewDealCreateAdapterEnabled,
} from './newDealCreateFeatureFlags';
import type { NewDealReferenceResolution } from './newDealReferenceResolver';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../admin/adminNewDealIntakeModel';
import { NOT_WIRED } from '../shared/governance/platformInventory';

/**
 * Phase 170M -- governed New Deal create adapter (DISABLED by default).
 *
 * Every test injects mock IO; NO live Dataverse write is ever made and no
 * deal is created. The adapter is exercised with `enabled: true` deps to
 * cover the success/audit logic, but that gate is test-local -- the app
 * default (NEW_DEAL_CREATE_ADAPTER_ENABLED) stays false.
 */

const READY_RESOLUTION: NewDealReferenceResolution = {
  kind: 'ready',
  stageId: 'stage-id-1',
  statusId: 'status-id-1',
  stageBind: '/cr664_dealstagereferences(stage-id-1)',
  statusBind: '/cr664_dealstatusreferences(status-id-1)',
};

function baseInput(over: Partial<GovernedNewDealCreateInput> = {}): GovernedNewDealCreateInput {
  return {
    dealName: 'TEST - Governed New Deal',
    assignedBankerId: 'banker-1',
    actorSystemUserId: 'sys-1',
    ...over,
  };
}

function deps(
  over: Partial<GovernedNewDealCreateDeps> = {},
): GovernedNewDealCreateDeps & {
  createSpy: ReturnType<typeof vi.fn>;
  auditSpy: ReturnType<typeof vi.fn>;
} {
  const createSpy = vi.fn(async (_p: NewDealCreatePayload) => ({ ok: true as const, id: 'new-deal-1' }));
  const auditSpy = vi.fn(async (_o: EmitNewDealAuditInput) => ({ ok: true }));
  return {
    enabled: true,
    resolveReferences: async () => READY_RESOLUTION,
    createLoanDeal: createSpy,
    emitAuditEvent: auditSpy,
    correlationId: () => 'corr-fixed',
    now: () => '2026-06-16T00:00:00.000Z',
    createSpy,
    auditSpy,
    ...over,
  };
}

describe('Phase 170M -- adapter refusal / validation / authorization', () => {
  it('1. refuses with `disabled` when the feature gate is off (no IO)', async () => {
    const d = deps({ enabled: false });
    const out = await createGovernedNewDeal(baseInput(), d);
    expect(out.kind).toBe('disabled');
    expect(d.createSpy).not.toHaveBeenCalled();
    expect(d.auditSpy).not.toHaveBeenCalled();
  });

  it('2. validation_error on a blank deal name', async () => {
    const d = deps();
    const out = await createGovernedNewDeal(baseInput({ dealName: '   ' }), d);
    expect(out).toMatchObject({ kind: 'validation_error', field: 'dealName' });
    expect(d.createSpy).not.toHaveBeenCalled();
  });

  it('3. unauthorized when no actor systemuser is provided', async () => {
    const d = deps();
    const out = await createGovernedNewDeal(baseInput({ actorSystemUserId: '' }), d);
    expect(out.kind).toBe('unauthorized');
    expect(d.createSpy).not.toHaveBeenCalled();
  });

  it('validation_error when the assigned banker id is blank', async () => {
    const out = await createGovernedNewDeal(baseInput({ assignedBankerId: '' }), deps());
    expect(out).toMatchObject({ kind: 'validation_error', field: 'assignedBanker' });
  });

  it('7. validation_error when amount is provided but invalid', async () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = await createGovernedNewDeal(baseInput({ amount: bad }), deps());
      expect(out).toMatchObject({ kind: 'validation_error', field: 'amount' });
    }
  });
});

describe('Phase 170M -- resolver dependency (fail closed)', () => {
  it('4. resolver_not_ready when Stage/Status do not resolve Ready', async () => {
    const notReady: NewDealReferenceResolution[] = [
      { kind: 'notConfigured', reason: 'no reader' },
      { kind: 'missingStage' },
      { kind: 'duplicateStatus', count: 2 },
      { kind: 'inactiveStage' },
      { kind: 'serviceError', message: 'boom' },
    ];
    for (const r of notReady) {
      const d = deps({ resolveReferences: async () => r });
      const out = await createGovernedNewDeal(baseInput(), d);
      expect(out.kind).toBe('resolver_not_ready');
      if (out.kind === 'resolver_not_ready') expect(out.resolution).toBe(r.kind);
      expect(d.createSpy).not.toHaveBeenCalled();
    }
  });

  // Factory Arc Phase 11 — the proof list requires distinguishing "missing
  // reference data" from "a Dataverse failure" as separate, specific
  // scenarios, not one generic sentence for every resolver_not_ready cause.
  it('resolver_not_ready carries a specific, honest detail per resolution kind — never the raw camelCase code', async () => {
    const cases: Array<[NewDealReferenceResolution, RegExp, RegExp[]]> = [
      [{ kind: 'missingStage' }, /No active Stage reference matches/i, [/missingStage/]],
      [{ kind: 'missingStatus' }, /No active Status reference matches/i, [/missingStatus/]],
      [{ kind: 'duplicateStage', count: 2 }, /Multiple active Stage references.*\(2\)/i, [/duplicateStage/]],
      [{ kind: 'duplicateStatus', count: 3 }, /Multiple active Status references.*\(3\)/i, [/duplicateStatus/]],
      [{ kind: 'inactiveStage' }, /matched Stage reference is inactive/i, [/inactiveStage/]],
      [{ kind: 'inactiveStatus' }, /matched Status reference is inactive/i, [/inactiveStatus/]],
      // "serviceError" is the real Dataverse-failure scenario — distinct
      // wording from the missing/inactive/duplicate reference-data cases.
      // Final LOS Completion arc (Workstream P) — the raw message ("timeout after 30s") is no
      // longer interpolated verbatim; only the shared safe message follows the intro sentence.
      [{ kind: 'serviceError', message: 'timeout after 30s' }, /Could not reach Dataverse.*We couldn't save that action/i, [/^serviceError$/, /timeout after 30s/]],
    ];
    for (const [r, expected, forbidden] of cases) {
      const d = deps({ resolveReferences: async () => r });
      const out = await createGovernedNewDeal(baseInput(), d);
      expect(out.kind).toBe('resolver_not_ready');
      if (out.kind !== 'resolver_not_ready') continue;
      expect(out.detail).toMatch(expected);
      for (const f of forbidden) expect(out.detail).not.toMatch(f);
    }
  });
});

describe('Phase 170M -- payload discipline (allow-list, resolved binds, no GUID)', () => {
  it('5 + 6. builds an allow-listed payload using the resolver-provided binds', async () => {
    const d = deps();
    const out = await createGovernedNewDeal(baseInput(), d);
    expect(out).toMatchObject({ kind: 'success', dealId: 'new-deal-1' });
    const payload = d.createSpy.mock.calls[0]![0] as NewDealCreatePayload;
    // Only allow-listed keys.
    for (const key of Object.keys(payload)) {
      expect(NEW_DEAL_CREATE_ALLOWED_FIELDS).toContain(key);
    }
    // Binds come verbatim from the resolver, not a hardcoded GUID.
    expect(payload['cr664_StageReference@odata.bind']).toBe(READY_RESOLUTION.stageBind);
    expect(payload['cr664_StatusReference@odata.bind']).toBe(READY_RESOLUTION.statusBind);
    expect(payload['cr664_AssignedBanker@odata.bind']).toBe('/cr664_bankers(banker-1)');
    expect(payload.cr664_dealname).toBe('TEST - Governed New Deal');
    expect(payload.cr664_stageentrydate).toBe('2026-06-16T00:00:00.000Z');
    // ownerid / statecode are NOT in the create body (Dataverse defaults them).
    expect(payload).not.toHaveProperty('ownerid');
    expect(payload).not.toHaveProperty('statecode');
  });

  it('7. amount is included only when provided and valid', async () => {
    const without = deps();
    await createGovernedNewDeal(baseInput(), without);
    expect(without.createSpy.mock.calls[0]![0]).not.toHaveProperty('cr664_amount');

    const withAmount = deps();
    await createGovernedNewDeal(baseInput({ amount: 250_000 }), withAmount);
    expect((withAmount.createSpy.mock.calls[0]![0] as NewDealCreatePayload).cr664_amount).toBe(250_000);
  });

  it('8. client bind is included only when an existing client id is provided', async () => {
    const without = deps();
    await createGovernedNewDeal(baseInput(), without);
    expect(without.createSpy.mock.calls[0]![0]).not.toHaveProperty('cr664_Client@odata.bind');

    const withClient = deps();
    await createGovernedNewDeal(baseInput({ existingClientId: 'client-9' }), withClient);
    expect((withClient.createSpy.mock.calls[0]![0] as NewDealCreatePayload)['cr664_Client@odata.bind']).toBe(
      '/cr664_clientrelationships(client-9)',
    );
  });

  it('8b. team bind is included only when an existing team id is provided', async () => {
    const without = deps();
    await createGovernedNewDeal(baseInput(), without);
    expect(without.createSpy.mock.calls[0]![0]).not.toHaveProperty('cr664_Team@odata.bind');

    const withTeam = deps();
    await createGovernedNewDeal(baseInput({ existingTeamId: 'team-7' }), withTeam);
    const payload = withTeam.createSpy.mock.calls[0]![0] as NewDealCreatePayload;
    expect(payload['cr664_Team@odata.bind']).toBe('/cr664_teams(team-7)');
    // Team bind is allow-listed.
    for (const key of Object.keys(payload)) expect(NEW_DEAL_CREATE_ALLOWED_FIELDS).toContain(key);
  });
});

describe('CRM-first client gate (fail-closed, before any create)', () => {
  it('client_required (no create) when requireCrmClient and no client is selected', async () => {
    const d = deps();
    const out = await createGovernedNewDeal(baseInput({ requireCrmClient: true }), d);
    expect(out.kind).toBe('client_required');
    // The blocker is BEFORE create -> no create IO, no audit.
    expect(d.createSpy).not.toHaveBeenCalled();
    expect(d.auditSpy).not.toHaveBeenCalled();
  });

  it('proceeds when requireCrmClient and a client IS selected', async () => {
    const d = deps();
    const out = await createGovernedNewDeal(baseInput({ requireCrmClient: true, existingClientId: 'client-1' }), d);
    expect(out.kind).toBe('success');
    expect((d.createSpy.mock.calls[0]![0] as NewDealCreatePayload)['cr664_Client@odata.bind']).toBe(
      '/cr664_clientrelationships(client-1)',
    );
  });

  it('proceeds without a client only when the admin/gate allows it', async () => {
    const d = deps();
    const out = await createGovernedNewDeal(
      baseInput({ requireCrmClient: true, allowCreateWithoutClient: true }),
      d,
    );
    expect(out.kind).toBe('success');
    expect(d.createSpy.mock.calls[0]![0]).not.toHaveProperty('cr664_Client@odata.bind');
  });
});

describe('link readback verification (client / team persisted on the created deal)', () => {
  it('success when the readback confirms the selected client + team', async () => {
    const readSpy = vi.fn(async () => ({ success: true, clientId: 'CLIENT-1', teamId: 'team-2' }));
    const d = deps({ readDealLinks: readSpy });
    const out = await createGovernedNewDeal(
      baseInput({ existingClientId: 'client-1', existingTeamId: 'team-2' }),
      d,
    );
    expect(out.kind).toBe('success');
    // Readback ran against the created id; GUID casing is tolerated.
    expect(readSpy).toHaveBeenCalledWith('new-deal-1');
    expect(d.auditSpy).toHaveBeenCalledTimes(1);
  });

  it('link_readback_mismatch (honest partial) when the deal does not point at the selected client', async () => {
    const readSpy = vi.fn(async () => ({ success: true, clientId: 'some-other-guid' }));
    const d = deps({ readDealLinks: readSpy });
    const out = await createGovernedNewDeal(baseInput({ existingClientId: 'client-1' }), d);
    expect(out).toMatchObject({ kind: 'link_readback_mismatch', dealId: 'new-deal-1' });
    // A best-effort FAILED audit is emitted; no clean success audit.
    expect(d.auditSpy).toHaveBeenCalledTimes(1);
  });

  it('link_readback_mismatch when the team lookup does not read back', async () => {
    const readSpy = vi.fn(async () => ({ success: true, clientId: 'client-1', teamId: undefined }));
    const d = deps({ readDealLinks: readSpy });
    const out = await createGovernedNewDeal(
      baseInput({ existingClientId: 'client-1', existingTeamId: 'team-2' }),
      d,
    );
    expect(out.kind).toBe('link_readback_mismatch');
  });

  it('link_readback_mismatch when the readback IO itself fails', async () => {
    const readSpy = vi.fn(async () => ({ success: false, error: 'read boom' }));
    const d = deps({ readDealLinks: readSpy });
    const out = await createGovernedNewDeal(baseInput({ existingClientId: 'client-1' }), d);
    expect(out.kind).toBe('link_readback_mismatch');
  });

  it('skips readback entirely when neither client nor team was requested', async () => {
    const readSpy = vi.fn(async () => ({ success: true }));
    const d = deps({ readDealLinks: readSpy });
    const out = await createGovernedNewDeal(baseInput(), d);
    expect(out.kind).toBe('success');
    expect(readSpy).not.toHaveBeenCalled();
  });
});

describe('Phase 170M -- create / audit outcomes', () => {
  it('create_failed when the deal create IO fails (best-effort failed audit)', async () => {
    const d = deps({ createLoanDeal: vi.fn(async () => ({ ok: false as const, error: 'create boom' })) });
    const out = await createGovernedNewDeal(baseInput(), d);
    expect(out).toMatchObject({ kind: 'create_failed', error: 'create boom' });
  });

  it('9. success emits a governed audit event in the existing pattern', async () => {
    const d = deps();
    const out = await createGovernedNewDeal(baseInput(), d);
    expect(out).toMatchObject({ kind: 'success', dealId: 'new-deal-1', correlationId: 'corr-fixed' });
    expect(d.auditSpy).toHaveBeenCalledTimes(1);
    const auditArg = d.auditSpy.mock.calls[0]![0] as EmitNewDealAuditInput;
    expect(auditArg.dealId).toBe('new-deal-1');
    expect(auditArg.correlationId).toBe('corr-fixed');
  });

  it('9. audit_failed_partial when the deal is created but the audit fails', async () => {
    const d = deps({ emitAuditEvent: vi.fn(async () => ({ ok: false, error: 'audit boom' })) });
    const out = await createGovernedNewDeal(baseInput(), d);
    expect(out).toMatchObject({
      kind: 'audit_failed_partial',
      dealId: 'new-deal-1',
      auditError: 'audit boom',
    });
  });
});

describe('Phase 170M -- disabled-by-default posture', () => {
  it('1 + 9. the feature flag constant is hard false and the live deps refuse', async () => {
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    // Even with every config prerequisite "true", the hard-false constant wins.
    expect(
      isNewDealCreateAdapterEnabled({
        adapterEnabled: true,
        productionReferencesApproved: true,
        auditWired: true,
      }),
    ).toBe(false);
    // The app-default live deps carry enabled:false, so the adapter refuses
    // before touching any live service.
    const live = buildLiveNewDealCreateDeps();
    expect(live.enabled).toBe(false);
    const out = await createGovernedNewDeal(baseInput(), live);
    expect(out.kind).toBe('disabled');
  });

  it('10. + New Deal create stays disabled in the app truth model', () => {
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });

  it('11. NOT_WIRED still includes new-deal-create', () => {
    expect(NOT_WIRED.some((e) => e.id === 'new-deal-create')).toBe(true);
  });
});

describe('Phase 170M -- adapter source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'newDealCreateAdapter.ts'), 'utf8');

  it('6. hardcodes no Dataverse record GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('12. touches no Advance Stage / stage-progression logic', () => {
    expect(SRC).not.toMatch(/advance\s*stage|stagehistory|stage\s*progression|cr664_stagereferences\b/i);
  });

  it('13. performs no CRM / portfolio entity writes', () => {
    // The adapter references the CRM-first client gate + copy (allowed), but it
    // must never create/import a CRM or portfolio ENTITY. Assert on real write
    // signatures — generated CRM/portfolio services and their entity payload
    // keys — rather than the bare "crm" substring.
    expect(SRC).not.toMatch(/portfolioboarding|portfolio_loan|cr664_organization|cr664_person/i);
    expect(SRC).not.toMatch(/Cr664_crm\w+Service/);
    expect(SRC).not.toMatch(/Cr664_portfolio\w+Service/);
    // The only cr664_clientrelationships touch is the cr664_Client lookup BIND
    // on the loan-deal create — never a client-relationship record create.
    expect(SRC).not.toMatch(/clientrelationshipsService/i);
    expect(SRC).toMatch(/cr664_Client@odata\.bind/);
  });

  it('14. uses no external Graph / fetch / XHR', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/https?:\/\//);
  });
});

describe('Phase 170P / BUGFIX -- audit payload discipline (canonical builder)', () => {
  const SRC = readFileSync(resolve(__dirname, 'newDealCreateAdapter.ts'), 'utf8');
  const AUDIT_SRC = readFileSync(resolve(__dirname, 'dealOriginationAudit.ts'), 'utf8');

  it('the adapter routes its audit payload through the single canonical builder', () => {
    expect(SRC).toMatch(/buildNewDealAuditPayload\(/);
    expect(SRC).toMatch(/summarizeAuditPayloadShape\(/);
  });

  it('the canonical builder binds cr664_ChangedBy to the resolved changedByBind (cr664_user), never a systemuser id', () => {
    expect(AUDIT_SRC).toMatch(/'cr664_ChangedBy@odata\.bind':\s*input\.changedByBind/);
    expect(AUDIT_SRC).not.toMatch(/'cr664_ChangedBy@odata\.bind':\s*`\/systemusers/);
    expect(AUDIT_SRC).toMatch(/cr664_correlationid:\s*input\.correlationId/);
  });

  it('BUGFIX -- the canonical builder sets NO ownerid / owneridtype / statecode and NO ActorUser', () => {
    const start = AUDIT_SRC.indexOf('export function buildNewDealAuditPayload');
    const end = AUDIT_SRC.indexOf('Back-compat alias', start);
    const block = AUDIT_SRC.slice(start, end);
    expect(block).not.toMatch(/\bownerid:/);
    expect(block).not.toMatch(/\bowneridtype:/);
    expect(block).not.toMatch(/\bstatecode:/);
    expect(block).not.toMatch(/cr664_ActorUser/);
  });

  it('BUGFIX -- the canonical builder binds NO /systemusers id and NO hardcoded /cr664_users GUID', () => {
    const start = AUDIT_SRC.indexOf('export function buildNewDealAuditPayload');
    const end = AUDIT_SRC.indexOf('Back-compat alias', start);
    const block = AUDIT_SRC.slice(start, end);
    // Zero systemuser binds -- cr664_ChangedBy targets cr664_user.
    const systemuserBinds = block.match(/'(cr664_\w+)@odata\.bind':\s*`\/systemusers\(/g) ?? [];
    expect(systemuserBinds.length).toBe(0);
    // The ChangedBy value is the caller-resolved variable, NEVER a literal
    // /systemusers or /cr664_users GUID embedded in source.
    expect(AUDIT_SRC).not.toMatch(/@odata\.bind':\s*`\/systemusers\(/);
    expect(AUDIT_SRC).not.toMatch(/@odata\.bind':\s*`\/cr664_[Uu]sers?\(/);
    expect(SRC).not.toMatch(/@odata\.bind':\s*`\/systemusers\(/);
    expect(SRC).not.toMatch(/@odata\.bind':\s*`\/cr664_[Uu]sers?\(/);
  });

  it('the canonical builder is NOT allow-listing cr664_ActorUser / ownerid / statecode', () => {
    expect(AUDIT_SRC).not.toMatch(/'cr664_ActorUser@odata\.bind',/);
    const allowStart = AUDIT_SRC.indexOf('ORIGINATION_AUDIT_ALLOWED_FIELDS');
    const allowEnd = AUDIT_SRC.indexOf('] as const)', allowStart);
    const allow = AUDIT_SRC.slice(allowStart, allowEnd);
    expect(allow).not.toMatch(/'ownerid'|'owneridtype'|'statecode'/);
  });

  it('uses verified, pinned audit option-set values (Lifecycle / AssignmentChange / LoanDeal)', () => {
    expect(AUDIT_SRC).toMatch(/AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002/);
    expect(AUDIT_SRC).toMatch(/AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE = 788190002/);
    expect(AUDIT_SRC).toMatch(/AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000/);
    expect(SRC).toMatch(/AUDIT_OUTCOME_SUCCEEDED/);
    expect(SRC).toMatch(/AUDIT_OUTCOME_FAILED/);
  });

  it('uses no bypass / suppress / force headers', () => {
    expect(SRC).not.toMatch(/BypassBusinessLogicExecution/i);
    expect(SRC).not.toMatch(/BypassCustomPluginExecution/i);
    expect(SRC).not.toMatch(/SuppressDuplicateDetection/i);
    expect(SRC).not.toMatch(/[?&]Force=true/i);
  });

  it('emits the audit AFTER the create, and returns audit_failed_partial on audit failure', () => {
    const createIdx = SRC.indexOf('await deps.createLoanDeal(payload)');
    const successAuditIdx = SRC.indexOf('outcome: AUDIT_OUTCOME_SUCCEEDED');
    expect(createIdx).toBeGreaterThan(-1);
    expect(successAuditIdx).toBeGreaterThan(createIdx);
    expect(SRC).toMatch(/kind: 'audit_failed_partial'/);
  });
});
