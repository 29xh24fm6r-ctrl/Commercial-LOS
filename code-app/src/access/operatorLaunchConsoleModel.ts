/**
 * Phase 210 / Lane A4 — Operator Launch Console model.
 *
 * Pure. Aggregates per-capability activation posture into one operator view:
 * each capability's gate flags + computed enabled/disabled/blocked state and
 * WHY, the latest smoke-test result (operator-recorded, injected), and a rollback
 * instruction. It reads injected state only — no env/secret reads, no Dataverse
 * probe — and it NEVER flips a gate. This is observe-only; a governed config
 * write does not exist, so the console exposes no flip action.
 *
 * No fabricated state: a capability with no recorded smoke shows "none", a
 * disabled capability shows exactly which required flags are false, and a blocked
 * capability shows its blockers (e.g. missing schema). Nothing is invented.
 *
 * Factory Arc Phase 4 — Platform Operations Workspace. Extended (additively,
 * all new fields optional) with the remaining per-capability facts the phase
 * spec asks admins to see: route/DI wiring state, the actor-authorization
 * requirement, the audit-sink state, the latest successful/failed write (when a
 * live audit query has been correlated to that capability — see
 * platformOperationsLiveDeps.ts), and who/when enabled it. There is no
 * Dataverse-tracked change history for a TypeScript feature-flag constant, so
 * `enabledBy`/`enabledOn` are honestly `null` unless the caller has a real
 * source (e.g. a future admin-editable setting) — never fabricated from the
 * flag's current value. `deploymentCommit` is console-level (one build, not
 * per-capability) and is read from a real build-time value — see
 * platformOperationsLiveDeps.ts — falling back to `null`, never a placeholder
 * string, when it cannot be determined.
 */

export type CapabilityGateState = 'enabled' | 'disabled' | 'blocked';

export type CapabilityCategory =
  | 'admin'
  | 'deal'
  | 'stage'
  | 'crm'
  | 'portfolio'
  | 'checklist'
  | 'comms'
  | 'document'
  | 'observability';

export interface CapabilityGateFlag {
  name: string;
  value: boolean;
  /** A required flag must be true for the capability to be enabled. */
  required: boolean;
}

export interface CapabilitySmokeResult {
  outcome: string;
  actor: string | null;
  correlationId: string | null;
  at: string | null;
}

/** A single recorded write outcome, surfaced honestly (no synthesized actor/time). */
export interface CapabilityWriteEvidence {
  actor: string | null;
  at: string | null;
  correlationId: string | null;
}

export interface CapabilityControlInput {
  key: string;
  label: string;
  category: CapabilityCategory;
  flags: CapabilityGateFlag[];
  /** Non-flag blockers (missing schema/service/reference), if any. */
  blockers?: string[];
  /** Latest recorded smoke result, or null if none has been run. */
  latestSmoke?: CapabilitySmokeResult | null;
  rollback: string;
  /** Whether the capability's route/UI entry point is mounted today. Static architecture fact, not a live probe. */
  routeState?: string;
  /** Which write adapter (if any) is wired for this capability's live writes. Static architecture fact. */
  diState?: string;
  /** What the acting user must have (permission/identity/role) for a write to be attempted. */
  actorAuthorizationRequirement?: string;
  /** Whether writes for this capability pass through the governed audit-event sink. */
  auditSinkState?: string;
  /**
   * Latest successful/failed write evidence from a live audit-event query correlated to this
   * capability. `undefined` means no live query has been correlated to this capability yet
   * (honest "not wired", distinct from "wired and found nothing"); `null` means the query ran
   * and found no matching event.
   */
  latestSuccessfulWrite?: CapabilityWriteEvidence | null;
  latestFailedWrite?: CapabilityWriteEvidence | null;
  /**
   * Who/when last changed this capability's enablement. A TypeScript feature-flag constant has
   * no Dataverse-tracked change history, so this is `null` unless a real source exists — never
   * inferred from the flag's current value.
   */
  enabledBy?: string | null;
  enabledOn?: string | null;
}

export interface OperatorLaunchConsoleInput {
  capabilities: CapabilityControlInput[];
  /** Build-time commit the running app was built from, or null when it could not be determined. */
  deploymentCommit?: string | null;
}

export interface CapabilityControlState {
  key: string;
  label: string;
  category: CapabilityCategory;
  state: CapabilityGateState;
  reason: string;
  flags: CapabilityGateFlag[];
  blockers: string[];
  latestSmoke: CapabilitySmokeResult | null;
  rollback: string;
  routeState: string | null;
  diState: string | null;
  actorAuthorizationRequirement: string | null;
  auditSinkState: string | null;
  latestSuccessfulWrite: CapabilityWriteEvidence | null | undefined;
  latestFailedWrite: CapabilityWriteEvidence | null | undefined;
  enabledBy: string | null;
  enabledOn: string | null;
}

export interface OperatorLaunchConsoleState {
  capabilities: CapabilityControlState[];
  counts: { enabled: number; disabled: number; blocked: number };
  /** This console never flips a gate from the UI. */
  canFlipFromUi: false;
  deploymentCommit: string | null;
}

function assess(c: CapabilityControlInput): CapabilityControlState {
  const blockers = c.blockers ?? [];
  const requiredFalse = c.flags.filter((f) => f.required && f.value !== true).map((f) => f.name);

  let state: CapabilityGateState;
  let reason: string;
  if (blockers.length > 0) {
    state = 'blocked';
    reason = `Blocked: ${blockers.join('; ')}.`;
  } else if (requiredFalse.length === 0 && c.flags.some((f) => f.required)) {
    state = 'enabled';
    reason = 'All required gates are satisfied.';
  } else if (requiredFalse.length === 0) {
    // No required flags declared — treat as disabled (nothing asserts it on).
    state = 'disabled';
    reason = 'No required gate asserts this capability is enabled.';
  } else {
    state = 'disabled';
    reason = `Disabled: required gate(s) off — ${requiredFalse.join(', ')}.`;
  }

  return {
    key: c.key,
    label: c.label,
    category: c.category,
    state,
    reason,
    flags: c.flags.map((f) => ({ ...f })),
    blockers,
    latestSmoke: c.latestSmoke ?? null,
    rollback: c.rollback,
    routeState: c.routeState ?? null,
    diState: c.diState ?? null,
    actorAuthorizationRequirement: c.actorAuthorizationRequirement ?? null,
    auditSinkState: c.auditSinkState ?? null,
    latestSuccessfulWrite: c.latestSuccessfulWrite,
    latestFailedWrite: c.latestFailedWrite,
    enabledBy: c.enabledBy ?? null,
    enabledOn: c.enabledOn ?? null,
  };
}

export function deriveOperatorLaunchConsole(input: OperatorLaunchConsoleInput): OperatorLaunchConsoleState {
  const capabilities = input.capabilities.map(assess);
  return {
    capabilities,
    counts: {
      enabled: capabilities.filter((c) => c.state === 'enabled').length,
      disabled: capabilities.filter((c) => c.state === 'disabled').length,
      blocked: capabilities.filter((c) => c.state === 'blocked').length,
    },
    canFlipFromUi: false,
    deploymentCommit: input.deploymentCommit ?? null,
  };
}
