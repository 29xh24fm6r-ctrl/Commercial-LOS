/**
 * Phase 170N -- Governed New Deal create controller (guarded UI boundary).
 *
 * The small layer between the admin UI and the governed create adapter. It
 * computes an honest VIEW-STATE from the fail-closed enablement reader (no IO,
 * no service import -- safe to evaluate on every render), and exposes a guarded
 * `submitGovernedNewDeal` that constructs live deps and calls the adapter ONLY
 * when every gate passes.
 *
 * Critically, this module imports the adapter as a TYPE only (erased at
 * compile) and loads its runtime via a DYNAMIC import inside the submit path.
 * So a component that renders the view-state never pulls the generated services
 * / SDK into its static graph, and the adapter (and any live dep) is reachable
 * only after the controlled gate is satisfied.
 */

import {
  evaluateNewDealCreateEnablement,
  type NewDealCreateEnablementInput,
  type NewDealCreateEnablementState,
} from './newDealCreateEnablement';
import {
  NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED,
} from '../admin/adminNewDealIntakeModel';
import type {
  GovernedNewDealCreateInput,
  NewDealCreateOutcome,
} from './newDealCreateAdapter';

/** Honest, render-safe view-state for the governed create surface. */
export type NewDealCreateViewState =
  | { kind: 'ready' }
  | { kind: 'disabled'; reason: string }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'environment_not_allowed'; reason: string }
  | { kind: 'config_invalid'; reason: string }
  | { kind: 'resolver_not_ready'; reason: string };

const HONEST_DISABLED_COPY =
  'New Deal creation is not enabled in this environment. No record has been created.';

/**
 * Map the controlled enablement state into a render-safe view-state. Pure: no
 * service call, no live-dep construction. The public-intake gate
 * (NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED) is an additional hard floor -- while it
 * is false the surface is never `ready`, regardless of config.
 */
export function getNewDealCreateViewState(
  input: NewDealCreateEnablementInput = {},
  /** Public-intake hard floor. Defaults to the committed constant (false this
   *  phase). Override is test-only; production callers never pass it. */
  intakeEnabled: boolean = NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED,
): NewDealCreateViewState {
  const state: NewDealCreateEnablementState = evaluateNewDealCreateEnablement(input);
  // Hard floor: the public intake gate must also be on. It is false this phase,
  // so the surface stays disabled even if a config tried to enable it.
  if (intakeEnabled !== true && state === 'enabled_nonprod_only') {
    return {
      kind: 'disabled',
      reason:
        'The governed adapter gate is on for this environment, but public + New Deal ' +
        'intake stays disabled (NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED=false). No record has been created.',
    };
  }
  switch (state) {
    case 'enabled_nonprod_only':
      return { kind: 'ready' };
    case 'unauthorized':
      return {
        kind: 'unauthorized',
        reason: 'You are not authorized to create deals here. No record has been created.',
      };
    case 'environment_not_allowed':
      return {
        kind: 'environment_not_allowed',
        reason:
          'New Deal creation is not approved for this environment. No record has been created.',
      };
    case 'config_invalid':
      return {
        kind: 'config_invalid',
        reason:
          'New Deal creation configuration is invalid; failing closed. No record has been created.',
      };
    case 'resolver_not_ready':
      return {
        kind: 'resolver_not_ready',
        reason:
          'Stage/Status references are not ready; create is blocked. No record has been created.',
      };
    case 'disabled':
    default:
      return { kind: 'disabled', reason: HONEST_DISABLED_COPY };
  }
}

/** True only when the surface is fully gated open and submit may run. */
export function canSubmitNewDeal(view: NewDealCreateViewState): boolean {
  return view.kind === 'ready';
}

/**
 * The runtime that performs the governed create. Default loads the adapter via
 * a dynamic import (so the static graph stays SDK-free) and runs it with live
 * deps whose `enabled` gate is forced true ONLY here -- reachable only after
 * the view-state proved `ready`. Tests inject a mock to avoid any adapter /
 * service import entirely.
 */
export type RunGovernedNewDealCreate = (
  input: GovernedNewDealCreateInput,
) => Promise<NewDealCreateOutcome>;

async function defaultRunGovernedNewDealCreate(
  input: GovernedNewDealCreateInput,
): Promise<NewDealCreateOutcome> {
  const adapter = await import('./newDealCreateAdapter');
  const base = adapter.buildLiveNewDealCreateDeps();
  // The enablement reader already proved every gate; flip the adapter's
  // disabled-by-default gate on for this single controlled call only.
  return adapter.createGovernedNewDeal(input, { ...base, enabled: true });
}

/**
 * Guarded submit. Re-evaluates the gate (defense in depth) and refuses BEFORE
 * touching the adapter / any live dep unless the view-state is `ready`. A
 * refusal maps to a typed adapter-shaped outcome without constructing deps.
 */
export async function submitGovernedNewDeal(
  formInput: GovernedNewDealCreateInput,
  enablement: NewDealCreateEnablementInput,
  opts: {
    runCreate?: RunGovernedNewDealCreate;
    /** Public-intake hard floor override (test-only). */
    intakeEnabled?: boolean;
  } = {},
): Promise<NewDealCreateOutcome> {
  const runCreate = opts.runCreate ?? defaultRunGovernedNewDealCreate;
  const view = getNewDealCreateViewState(enablement, opts.intakeEnabled);
  if (view.kind !== 'ready') {
    switch (view.kind) {
      case 'unauthorized':
        return { kind: 'unauthorized', reason: view.reason };
      case 'resolver_not_ready':
        return { kind: 'resolver_not_ready', resolution: 'notConfigured', detail: view.reason };
      default:
        // disabled / environment_not_allowed / config_invalid all refuse as
        // `disabled` (no live dep constructed, no service call, no audit).
        return { kind: 'disabled', reason: view.reason };
    }
  }
  return runCreate(formInput);
}
