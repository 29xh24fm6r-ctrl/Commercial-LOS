/**
 * Factory Arc Phase 4 — Platform Operations Workspace live wiring.
 *
 * Assembles the real `OperatorLaunchConsoleInput` for all 12 required
 * capabilities: static specs (platformOperationsCapabilitySpecs.ts) + a real
 * build-time deployment commit + live "latest write" audit evidence for the
 * capabilities whose write adapter's `sourceProcess` signature has been
 * VERIFIED against real code (see loadLatestCapabilityWrite's doc comment).
 *
 * Smoke evidence is passed through empty (`source: 'out-of-band', records: []`)
 * — no Dataverse smoke-evidence table exists yet (operatorSmokeEvidenceRegistry.ts),
 * so every capability honestly shows "no smoke recorded" rather than a
 * fabricated pass. This module performs no route/component import — only the
 * generated Dataverse SDK, dynamically imported, matching every other
 * `*LiveDeps.ts` module in this codebase.
 *
 * "DI state" here means "which adapter file is wired into a write path" — a
 * compile-time fact documented on each spec, not a runtime-introspectable DI
 * container (this codebase has none).
 */

import { PLATFORM_OPERATIONS_CAPABILITY_SPECS } from './platformOperationsCapabilitySpecs';
import { getDeploymentCommit } from '../shared/deploymentCommit';
import type { OperatorLaunchConsoleInput, CapabilityWriteEvidence } from '../access/operatorLaunchConsoleModel';
import { latestEvidenceByCapability, toCapabilitySmokeResult } from '../access/operatorSmokeEvidenceRegistry';
import type { SmokeCapability } from '../access/operatorSmokeEvidenceRegistry';

/**
 * Real, VERIFIED `sourceProcess` prefixes (see dealOriginationAudit.ts callers,
 * grepped for literal `sourceProcess: '...'` assignments). Only capabilities
 * with a confirmed prefix are queried; the rest report `undefined`
 * (latestSuccessfulWrite/latestFailedWrite = "not yet correlated") rather than
 * risk matching the wrong capability's events.
 */
const VERIFIED_SOURCE_PROCESS_PREFIXES: Partial<Record<SmokeCapability, string>> = {
  'new-deal-create': 'NewDealCreateAdapter/',
  'stage-progression': 'StageAdvanceWriteDependency/',
  'checklist-generation': 'checklistWriteDependency/',
  'document-upload': 'documentUploadAction/',
  // Factory Arc Phase 15 -- verified against src/deals/createDealTaskAction.ts's literal
  // cr664_sourcescreensourceprocess: 'DealWorkspace/DealTasks/create' (dealTaskActions.ts's
  // complete-task write shares the same 'DealWorkspace/DealTasks/' prefix).
  'task-generation': 'DealWorkspace/DealTasks/',
};

async function loadWriteEvidence(
  key: SmokeCapability,
): Promise<{ success: CapabilityWriteEvidence | null | undefined; failure: CapabilityWriteEvidence | null | undefined }> {
  const prefix = VERIFIED_SOURCE_PROCESS_PREFIXES[key];
  if (!prefix) return { success: undefined, failure: undefined };
  const { loadLatestCapabilityWrite } = await import('./adminDiagnosticsQueries');
  const [success, failure] = await Promise.all([
    loadLatestCapabilityWrite(prefix, 'success'),
    loadLatestCapabilityWrite(prefix, 'failure'),
  ]);
  return { success, failure };
}

/**
 * Loads the live parts (write evidence + deployment commit) and assembles the
 * full console input. Never throws on a single capability's write-evidence
 * query failing to load — that capability's write fields fall back to
 * `undefined` ("not yet correlated") rather than failing the whole workspace.
 */
export async function buildPlatformOperationsConsoleInput(): Promise<OperatorLaunchConsoleInput> {
  const smokeLatest = latestEvidenceByCapability({ source: 'out-of-band', records: [] });

  const capabilities = await Promise.all(
    PLATFORM_OPERATIONS_CAPABILITY_SPECS.map(async (spec) => {
      let success: CapabilityWriteEvidence | null | undefined;
      let failure: CapabilityWriteEvidence | null | undefined;
      try {
        const evidence = await loadWriteEvidence(spec.key);
        success = evidence.success;
        failure = evidence.failure;
      } catch {
        // Honest fallback: the query failed to load, not "no writes ever occurred".
        success = undefined;
        failure = undefined;
      }
      return {
        ...spec,
        latestSmoke: toCapabilitySmokeResult(smokeLatest[spec.key]),
        latestSuccessfulWrite: success,
        latestFailedWrite: failure,
        // No Dataverse-tracked change history exists for a TypeScript flag constant.
        enabledBy: null,
        enabledOn: null,
      };
    }),
  );

  return {
    capabilities,
    deploymentCommit: getDeploymentCommit(),
  };
}
