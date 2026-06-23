import type { CapabilitySmokeResult } from './operatorLaunchConsoleModel';

/**
 * Phase 211 / Lane A4 — Operator Smoke Evidence Registry.
 *
 * A PURE read model for operator-recorded smoke-test evidence so the Phase 210
 * console can show REAL (or explicitly injected) evidence instead of static data.
 * It reads injected records only — no Dataverse probe, no env/secret read, no
 * network — and it NEVER infers a pass from green tests. Missing evidence is
 * surfaced as `not-run`, and the registry can never, by itself, mark a capability
 * "live": GO requires an explicit passed smoke AND a verified rollback.
 *
 * Because no Dataverse evidence table exists yet, evidence is supplied
 * out-of-band; the registry records its `source` so the operator console can label
 * it honestly. An OPTIONAL governed write adapter is provided but DISABLED by
 * default and fail-closed, modeling the governance shape for when a table lands.
 */

export const SMOKE_CAPABILITIES = [
  'admin-entitlement-grant',
  'admin-entitlement-revoke',
  'new-deal-create',
  'stage-progression',
  'crm-writeback',
  'portfolio-boarding',
  'checklist-generation',
  'borrower-communication',
  'document-upload',
] as const;
export type SmokeCapability = (typeof SMOKE_CAPABILITIES)[number];

export const SMOKE_OUTCOMES = ['passed', 'failed', 'partial', 'not-run'] as const;
export type SmokeOutcome = (typeof SMOKE_OUTCOMES)[number];

export interface OperatorSmokeEvidence {
  readonly capability: SmokeCapability;
  readonly outcome: SmokeOutcome;
  readonly actorUpn: string;
  readonly actorPlatformUserId: string;
  /** ISO-8601 UTC timestamp the operator recorded the smoke. */
  readonly timestamp: string;
  readonly correlationId: string;
  readonly environmentName: string;
  readonly evidenceNote: string;
  readonly rollbackVerified: boolean;
}

/** Where the evidence came from. No Dataverse table exists yet → 'out-of-band'. */
export type SmokeEvidenceSource = 'out-of-band' | 'dataverse';

export interface SmokeEvidenceRegistryInput {
  readonly source: SmokeEvidenceSource;
  /** Operator-supplied evidence. Empty when nothing has been recorded. */
  readonly records: ReadonlyArray<OperatorSmokeEvidence>;
}

function isSmokeCapability(value: string): value is SmokeCapability {
  return (SMOKE_CAPABILITIES as readonly string[]).includes(value);
}
function isSmokeOutcome(value: string): value is SmokeOutcome {
  return (SMOKE_OUTCOMES as readonly string[]).includes(value);
}

/**
 * The latest evidence per capability, chosen deterministically by the greatest
 * timestamp (ties broken by later array position). Capabilities with no record map
 * to null. Malformed records (unknown capability/outcome) are ignored — never
 * coerced into a pass.
 */
export function latestEvidenceByCapability(
  input: SmokeEvidenceRegistryInput,
): Record<SmokeCapability, OperatorSmokeEvidence | null> {
  const latest = {} as Record<SmokeCapability, OperatorSmokeEvidence | null>;
  for (const cap of SMOKE_CAPABILITIES) latest[cap] = null;
  input.records.forEach((r) => {
    if (!isSmokeCapability(r.capability) || !isSmokeOutcome(r.outcome)) return;
    const current = latest[r.capability];
    // Greatest timestamp wins; equal timestamps prefer the later record (>=).
    if (current === null || r.timestamp >= current.timestamp) {
      latest[r.capability] = r;
    }
  });
  return latest;
}

export interface CapabilitySmokeReadiness {
  readonly capability: SmokeCapability;
  readonly source: SmokeEvidenceSource;
  readonly latest: OperatorSmokeEvidence | null;
  readonly smokeOutcome: SmokeOutcome;
  readonly smokePassed: boolean;
  readonly rollbackVerified: boolean;
  /** GO is blocked unless smoke passed AND rollback verified. */
  readonly blocksGo: boolean;
  readonly blockReason: string | null;
}

/**
 * One readiness row per capability (always all nine). A capability with no passed
 * smoke, or a passed smoke whose rollback is unverified, BLOCKS GO. The registry
 * never asserts "live" on its own — this only reports evidence honestly.
 */
export function deriveCapabilitySmokeReadiness(
  input: SmokeEvidenceRegistryInput,
): CapabilitySmokeReadiness[] {
  const latestMap = latestEvidenceByCapability(input);
  return SMOKE_CAPABILITIES.map((capability) => {
    const latest = latestMap[capability];
    const smokeOutcome: SmokeOutcome = latest?.outcome ?? 'not-run';
    const smokePassed = smokeOutcome === 'passed';
    const rollbackVerified = latest?.rollbackVerified === true;
    let blockReason: string | null = null;
    if (!latest) blockReason = 'No smoke evidence recorded.';
    else if (!smokePassed) blockReason = `Latest smoke is "${smokeOutcome}", not "passed".`;
    else if (!rollbackVerified) blockReason = 'Smoke passed but rollback is not verified.';
    return {
      capability,
      source: input.source,
      latest,
      smokeOutcome,
      smokePassed,
      rollbackVerified,
      blocksGo: blockReason !== null,
      blockReason,
    };
  });
}

/**
 * Map an evidence record into the Phase 210 console's CapabilitySmokeResult shape
 * so the console can display real evidence. Null evidence → null (the console then
 * renders "none"). No fabrication.
 */
export function toCapabilitySmokeResult(
  evidence: OperatorSmokeEvidence | null,
): CapabilitySmokeResult | null {
  if (!evidence) return null;
  return {
    outcome: evidence.outcome,
    actor: evidence.actorUpn || null,
    correlationId: evidence.correlationId || null,
    at: evidence.timestamp || null,
  };
}

// ---------------------------------------------------------------------------
// OPTIONAL governed evidence-write adapter (DISABLED by default, fail-closed)
// ---------------------------------------------------------------------------

/**
 * Single on-switch for the governed smoke-evidence write. DISABLED by default:
 * no Dataverse evidence table exists, so evidence stays out-of-band until a table
 * is registered and this is intentionally enabled with a transport injected.
 */
export const OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED = false;

/** Injected persistence transport (a real Dataverse evidence sink, when it exists). */
export interface SmokeEvidenceTransport {
  persist(evidence: OperatorSmokeEvidence): Promise<void>;
}

export type RecordSmokeEvidenceOutcome =
  | { kind: 'recorded'; evidence: OperatorSmokeEvidence }
  | { kind: 'disabled'; reason: string }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'no-transport'; reason: string }
  | { kind: 'validation-error'; reason: string }
  | { kind: 'failed'; reason: string };

export interface RecordSmokeEvidenceInput {
  readonly evidence: OperatorSmokeEvidence;
  /** Only a Super Admin may record governed evidence. */
  readonly actorIsSuperAdmin: boolean;
  /** Defaults to OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED. */
  readonly writeEnabled?: boolean;
  /** Injected sink. Absent → no-transport (evidence remains out-of-band). */
  readonly transport?: SmokeEvidenceTransport;
}

function validateEvidence(e: OperatorSmokeEvidence): string | null {
  if (!isSmokeCapability(e.capability)) return 'Unknown capability.';
  if (!isSmokeOutcome(e.outcome)) return 'Unknown outcome.';
  const required: ReadonlyArray<[string, string]> = [
    ['actorUpn', e.actorUpn],
    ['actorPlatformUserId', e.actorPlatformUserId],
    ['timestamp', e.timestamp],
    ['correlationId', e.correlationId],
    ['environmentName', e.environmentName],
    ['evidenceNote', e.evidenceNote],
  ];
  for (const [name, value] of required) {
    if (typeof value !== 'string' || value.trim().length === 0) return `Missing ${name}.`;
  }
  return null;
}

/**
 * Governed, fail-closed evidence write. Honors the flag, requires Super Admin,
 * validates the record, and requires an injected transport. Returns a typed
 * outcome — it never fabricates a "recorded" result without a real persist.
 */
export async function recordSmokeEvidence(
  input: RecordSmokeEvidenceInput,
): Promise<RecordSmokeEvidenceOutcome> {
  const enabled = input.writeEnabled ?? OPERATOR_SMOKE_EVIDENCE_WRITE_ENABLED;
  if (!enabled) {
    return { kind: 'disabled', reason: 'Smoke-evidence write is disabled; evidence is recorded out-of-band.' };
  }
  if (input.actorIsSuperAdmin !== true) {
    return { kind: 'unauthorized', reason: 'Only a Super Admin may record smoke evidence.' };
  }
  const invalid = validateEvidence(input.evidence);
  if (invalid) return { kind: 'validation-error', reason: invalid };
  if (!input.transport) {
    return { kind: 'no-transport', reason: 'No evidence transport injected; no Dataverse evidence table exists yet.' };
  }
  try {
    await input.transport.persist(input.evidence);
    return { kind: 'recorded', evidence: input.evidence };
  } catch (err: unknown) {
    return { kind: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}
