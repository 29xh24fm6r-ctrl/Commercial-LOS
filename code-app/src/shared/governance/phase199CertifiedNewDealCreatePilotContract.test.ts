import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateBankerCreateRollout,
  type BankerCreateRolloutInput,
} from '../../deals/bankerNewDealCreateRollout';
import {
  BANKER_CREATE_PILOT_ENABLED,
  BANKER_CREATE_PILOT,
  bankerCreatePilotGateValues,
} from '../../deals/bankerCreatePilotConfig';
import { deriveFullSystemLaunchReadiness } from '../../admin/fullSystemLaunchReadinessModel';
import { BANKER_NEW_DEAL_CREATE_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';

/**
 * PHASE 199 — Certified New Deal create pilot enablement contract.
 *
 * The certified pilot is enabled ONLY via the operator-controlled pilot switch
 * (Phase 182B). The three global create constants stay false (no broad rollout).
 * These pins prove pilot-only `live_controlled`, fail-closed everywhere else,
 * one-line rollback, and that no other write gate moved.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_199_CERTIFIED_NEW_DEAL_CREATE_PILOT.md';
const PILOT_CONFIG = read('src/deals/bankerCreatePilotConfig.ts');
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

/** A fully-satisfied certified pilot context (actor + auth + references + resolver). */
function pilotContext(over: Partial<BankerCreateRolloutInput> = {}): BankerCreateRolloutInput {
  return {
    actorSystemUserId: 'su-pilot',
    bankerAuthorized: true,
    resolverReady: true,
    productionReferencesApproved: BANKER_CREATE_PILOT.productionReferencesApproved,
    environmentIsProduction: BANKER_CREATE_PILOT.environmentIsProduction,
    productionRolloutApproved: BANKER_CREATE_PILOT.productionRolloutApproved,
    gateValues: bankerCreatePilotGateValues(),
    ...over,
  };
}

describe('199 — doc + snapshot', () => {
  it('the Phase 199 doc + contract test exist', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(existsSync(resolve(ROOT, 'src/shared/governance/phase199CertifiedNewDealCreatePilotContract.test.ts'))).toBe(true);
  });
  it('the snapshot references Phase 199', () => {
    expect(SNAPSHOT).toMatch(/PHASE_199_CERTIFIED_NEW_DEAL_CREATE_PILOT/);
  });
});

describe('199 — certified pilot is enabled, pilot-only', () => {
  it('the certified pilot switch is on and supplies only the banker/adapter/intake gates', () => {
    expect(BANKER_CREATE_PILOT_ENABLED).toBe(true);
    const gv = bankerCreatePilotGateValues();
    expect(gv).toEqual({ banker: true, adapter: true, intake: true });
    // No public / downstream gate keys leak into the pilot gate values.
    expect(Object.keys(gv ?? {}).sort()).toEqual(['adapter', 'banker', 'intake']);
  });

  it('the fully-satisfied certified pilot context evaluates live_controlled', () => {
    expect(evaluateBankerCreateRollout(pilotContext())).toBe('live_controlled');
  });

  it('a non-pilot context (no pilot gate values) stays disabled', () => {
    expect(evaluateBankerCreateRollout(pilotContext({ gateValues: undefined }))).toBe('disabled');
  });

  it('default evaluateBankerCreateRollout() (no overrides) is disabled', () => {
    expect(evaluateBankerCreateRollout()).toBe('disabled');
  });
});

describe('199 — fail closed', () => {
  it('missing actor identity is unauthorized (no actorless create)', () => {
    expect(evaluateBankerCreateRollout(pilotContext({ actorSystemUserId: null }))).toBe('unauthorized');
  });
  it('missing banker authorization is unauthorized', () => {
    expect(evaluateBankerCreateRollout(pilotContext({ bankerAuthorized: false }))).toBe('unauthorized');
  });
  it('unapproved references / unready resolver block create', () => {
    expect(evaluateBankerCreateRollout(pilotContext({ productionReferencesApproved: false }))).toBe('references_not_approved');
    expect(evaluateBankerCreateRollout(pilotContext({ resolverReady: false }))).toBe('resolver_not_ready');
  });
  it('rollback is one line: the pilot gate values are gated behind the switch', () => {
    expect(PILOT_CONFIG).toMatch(/return BANKER_CREATE_PILOT_ENABLED\s*\n?\s*\?\s*\{ banker: true, adapter: true, intake: true \}\s*\n?\s*:\s*undefined/);
  });
});

describe('199 — no broad write enablement + recommendation stable', () => {
  it('the three global create constants remain false (no broad rollout)', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });
  it('the three checklist gates remain false', () => {
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
  });
  it('CRM + workflow domains remain conditional / gated in the readiness model', () => {
    const r = deriveFullSystemLaunchReadiness();
    const crm = r.domains.find((d) => d.id === 'crm-salesforce-ncino')!;
    const wf = r.domains.find((d) => d.id === 'workflow-factory')!;
    expect(crm.status).toBe('conditional');
    expect([...crm.details, ...crm.safetyNotes].join(' ')).toMatch(/gated|fail-closed/i);
    expect(wf.status).toBe('conditional');
    expect([...wf.details, ...wf.safetyNotes].join(' ')).toMatch(/fail-closed/i);
  });
  it('the launch recommendation remains CONDITIONAL_GO', () => {
    expect(deriveFullSystemLaunchReadiness().recommendation).toBe('CONDITIONAL_GO');
  });
});
