import type { DealSharePointDryRunPort } from './dealSharePointDryRunPort';
import { unavailableDealSharePointDryRunPort } from './dealSharePointDryRunPort';
import {
  buildDealSharePointPowerAutomateDryRunTransport,
  createGeneratedPowerAutomateDryRunPort,
  verifyDealSharePointPowerAutomateRegistration,
  type DealSharePointPowerAutomateSelection,
  type GeneratedPowerAutomateRunner,
} from './dealSharePointPowerAutomateTransport';

export interface DealSharePointDryRunRuntime {
  readonly available: boolean;
  readonly reasons: readonly string[];
  readonly port: DealSharePointDryRunPort;
}

let runtime: DealSharePointDryRunRuntime = Object.freeze({
  available: false,
  reasons: ['The inspected Power Apps workflow Run client has not been registered by production composition.'],
  port: unavailableDealSharePointDryRunPort,
});

/**
 * Called only by production composition with the exact generated workflow client.
 * The repository does not fabricate a service name or Run signature.
 */
export function registerGeneratedDealSharePointDryRunRuntime(
  runner: GeneratedPowerAutomateRunner,
  selection: DealSharePointPowerAutomateSelection,
): void {
  if (runtime.available) throw new Error('DRY_RUN_RUNTIME_ALREADY_REGISTERED');
  const readiness = verifyDealSharePointPowerAutomateRegistration(selection);
  if (!readiness.ready || readiness.mode !== 'DRY_RUN') throw new Error('DRY_RUN_RUNTIME_NOT_CERTIFIED');
  runtime = Object.freeze({
    available: true,
    reasons: [],
    port: buildDealSharePointPowerAutomateDryRunTransport(selection, createGeneratedPowerAutomateDryRunPort(runner)),
  });
}

export function getDealSharePointDryRunRuntime(): DealSharePointDryRunRuntime {
  return runtime;
}
