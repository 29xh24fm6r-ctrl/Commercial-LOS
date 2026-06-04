/**
 * SPEC-COPILOT-LIVE-CONNECTOR-AND-SAFE-ACTION-ADAPTERS-1 — assist context types.
 *
 * Rich, read-only context shapes the governed Copilot connector consumes.
 * Every field is built from data the surface has ALREADY loaded and
 * authorized (see the per-surface builders). Nothing here triggers a
 * Dataverse query, and nothing here is ever mutated by Copilot.
 *
 * BIE (committee-evidence / underwriting-readiness) is modelled as an
 * OPTIONAL block. There is no BIE Dataverse loader in this repo today,
 * so production deal contexts leave `bie` undefined. When a future spec
 * wires an authorized BIE loader, it can populate this block; until then
 * the OmniCare acceptance is exercised with an in-memory fixture. Copilot
 * only ever READS this block — it never accepts evidence, clears a
 * committee blocker, or mutates a task.
 */

import type { CopilotDealContext, CopilotWorkspaceContext } from './copilotAssistantAdapter';

/** A single committee-evidence task as Copilot sees it (read-only). */
export interface CopilotBieEvidenceTask {
  /** Stable category key, e.g. 'sos_registry', 'public_adverse', 'website'. */
  category: string;
  /** Human label, e.g. 'SOS / business registry'. */
  label: string;
  /** Review status of the task. */
  status: 'missing' | 'pending' | 'accepted' | 'rejected';
  /** True when the accepted evidence meets committee grade. */
  committeeGrade: boolean;
  /**
   * True when an accepted item could clear its blocker automatically.
   * `false` means a human/analyst step is still required even though the
   * item is accepted (e.g. scale-plausibility judgement).
   */
  autoClearable?: boolean;
  note?: string;
}

/**
 * Bank Intelligence Evidence (committee readiness) context. Read-only.
 * Mirrors the two-gate model: preliminary eligibility vs committee
 * eligibility, plus the committee evidence task set and blockers.
 */
export interface CopilotBieContext {
  /** Preliminary (pre-committee) eligibility gate. */
  preliminaryEligible: boolean;
  /** Committee eligibility gate. */
  committeeEligible: boolean;
  /** Total committee evidence tasks. */
  evidenceTaskCount: number;
  evidenceTasks: ReadonlyArray<CopilotBieEvidenceTask>;
  /** Outstanding committee blocker categories (human labels). */
  committeeBlockerCategories: ReadonlyArray<string>;
  /** Source-snapshot collection status, when known. */
  sourceSnapshotStatus?: string;
  /** Research grade label, when known (e.g. 'preliminary', 'committee'). */
  researchGrade?: string;
}

/** Deal-cockpit assist context — already-loaded, authorized data only. */
export interface CopilotDealAssistContext {
  deal: CopilotDealContext;
  riskFlags: ReadonlyArray<string>;
  readinessBlockers: ReadonlyArray<string>;
  /** Mechanical next-best-action label from the shared VM, if any. */
  nextBestAction?: string;
  /**
   * Optional committee-readiness block. Undefined in production today
   * (no authorized BIE loader); populated by fixtures for acceptance.
   */
  bie?: CopilotBieContext;
}

/** Command-center assist context — already-loaded snapshot data only. */
export interface CopilotWorkspaceAssistContext {
  workspace: CopilotWorkspaceContext;
  /** Top blocker / exception labels surfaced by the snapshot. */
  topBlockers: ReadonlyArray<string>;
}
