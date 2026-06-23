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
}

export interface OperatorLaunchConsoleInput {
  capabilities: CapabilityControlInput[];
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
}

export interface OperatorLaunchConsoleState {
  capabilities: CapabilityControlState[];
  counts: { enabled: number; disabled: number; blocked: number };
  /** This console never flips a gate from the UI. */
  canFlipFromUi: false;
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
  };
}
