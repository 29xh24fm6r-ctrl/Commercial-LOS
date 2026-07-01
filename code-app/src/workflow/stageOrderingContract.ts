/**
 * Stage Advancement — canonical stage ordering contract (Phase 2).
 *
 * The deterministic, FAIL-CLOSED source of "what stage comes next / previous," driven entirely by
 * the seeded `cr664_sequence` on the stage-reference rows. The ordering lives in DATA, not in code:
 * this module never invents an order. If the seeded set is missing a stage, carries a duplicate
 * code, lacks a sequence, or has a duplicate/non-numeric sequence, the result is an explicit
 * `unavailable` with reasons — never a guessed order.
 *
 * Pure and dependency-injected: callers pass the stage-reference rows (loaded from
 * `Cr664_dealstagereferencesService`). `StageReferenceRow` is declared structurally (optional
 * `cr664_sequence`) so this compiles against today's generated model AND the post-regen model that
 * exposes the field — when the field is absent at runtime, ordering fails closed.
 */

export const CANONICAL_STAGE_CODES = [
  'INTAKE',
  'UNDERWRITING',
  'CREDIT_APPROVAL',
  'COMMITMENT',
  'DOCUMENTATION',
  'CLOSING_FUNDING',
  'BOARDED',
] as const;

export type CanonicalStageCode = (typeof CANONICAL_STAGE_CODES)[number];

const CANONICAL_CODE_SET: ReadonlySet<string> = new Set(CANONICAL_STAGE_CODES);

export function isCanonicalStageCode(value: string): value is CanonicalStageCode {
  return CANONICAL_CODE_SET.has(value);
}

/**
 * Canonical stage DISPLAY vocabulary — code + ratified name + nominal sequence (the
 * §1 set the founder confirmed). This is the single source of truth for what stages
 * are NAMED and ORDERED on screen, so every renderer speaks one language even before
 * the references are seeded.
 *
 * The nominal `sequence` here is the ratified default; the LIVE governed ordering
 * still comes from the seeded `cr664_sequence` via `resolveStageOrdering` (fail-closed).
 * Use this for display/recognition; use `resolveStageOrdering` for governed transitions.
 */
export interface CanonicalStageMeta {
  readonly code: CanonicalStageCode;
  readonly name: string;
  readonly sequence: number;
}

export const CANONICAL_STAGES: readonly CanonicalStageMeta[] = [
  { code: 'INTAKE', name: 'Intake', sequence: 10 },
  { code: 'UNDERWRITING', name: 'Underwriting', sequence: 20 },
  { code: 'CREDIT_APPROVAL', name: 'Credit Approval', sequence: 30 },
  { code: 'COMMITMENT', name: 'Commitment', sequence: 40 },
  { code: 'DOCUMENTATION', name: 'Documentation', sequence: 50 },
  { code: 'CLOSING_FUNDING', name: 'Closing & Funding', sequence: 60 },
  { code: 'BOARDED', name: 'Boarded / Servicing', sequence: 70 },
] as const;

const CANONICAL_BY_CODE: ReadonlyMap<CanonicalStageCode, CanonicalStageMeta> = new Map(
  CANONICAL_STAGES.map((s) => [s.code, s]),
);
const CANONICAL_BY_NAME: ReadonlyMap<string, CanonicalStageMeta> = new Map(
  CANONICAL_STAGES.map((s) => [s.name.toLowerCase(), s]),
);

/** Canonical metadata for an exact canonical code, or undefined. */
export function canonicalStageByCode(code: string): CanonicalStageMeta | undefined {
  return CANONICAL_BY_CODE.get(code as CanonicalStageCode);
}

/**
 * Recognize a stored/legacy stage string as a canonical stage — by exact code
 * (case-insensitive) OR exact ratified name (case-insensitive). Returns undefined
 * for anything that is not canonical (honest "unmapped — needs review"); never
 * fabricates a mapping for a legacy value with no clean canonical equivalent.
 */
export function recognizeCanonicalStage(stored: string | null | undefined): CanonicalStageMeta | undefined {
  const v = (stored ?? '').trim();
  if (v.length === 0) return undefined;
  return CANONICAL_BY_CODE.get(v.toUpperCase() as CanonicalStageCode) ?? CANONICAL_BY_NAME.get(v.toLowerCase());
}

/** Structural shape of a stage-reference row — a subset of the generated model. */
export interface StageReferenceRow {
  readonly cr664_code?: string | null;
  readonly cr664_name?: string | null;
  readonly cr664_sequence?: number | null;
  readonly cr664_activeflag?: boolean | null;
}

export interface OrderedStage {
  readonly code: CanonicalStageCode;
  readonly name: string;
  readonly sequence: number;
  /** True for the stage with no successor (highest sequence) — the terminal-success stage. */
  readonly terminal: boolean;
}

export interface StageOrdering {
  readonly status: 'ready';
  /** Ascending by sequence. */
  readonly stages: readonly OrderedStage[];
  /** The immediate next stage by sequence, or undefined if `current` is terminal/unknown. */
  nextStage(current: CanonicalStageCode): OrderedStage | undefined;
  /** All stages strictly before `current`, ascending (the valid Return targets). */
  priorStages(current: CanonicalStageCode): readonly OrderedStage[];
  /** True only for the highest-sequence stage. */
  isTerminal(stage: CanonicalStageCode): boolean;
  /** Map keyed by sequence number. */
  stageBySequence(): ReadonlyMap<number, OrderedStage>;
  stageByCode(code: CanonicalStageCode): OrderedStage | undefined;
}

export interface StageOrderingUnavailable {
  readonly status: 'unavailable';
  readonly reasons: readonly string[];
}

export type StageOrderingResult = StageOrdering | StageOrderingUnavailable;

interface NormalizedRow {
  code: string;
  name: string;
  sequence: number | undefined;
  active: boolean;
}

function normalize(rows: readonly StageReferenceRow[]): NormalizedRow[] {
  return rows.map((r) => ({
    code: (r.cr664_code ?? '').trim(),
    name: (r.cr664_name ?? '').trim(),
    sequence: typeof r.cr664_sequence === 'number' ? r.cr664_sequence : undefined,
    // A row is active unless explicitly inactive (Dataverse may omit the default-true flag).
    active: r.cr664_activeflag !== false,
  }));
}

/**
 * Resolve the canonical stage ordering from seeded rows. Fail-closed on ANY ambiguity.
 */
export function resolveStageOrdering(rows: readonly StageReferenceRow[]): StageOrderingResult {
  const reasons: string[] = [];
  const active = normalize(rows).filter((r) => r.active && r.code.length > 0);

  // 1. Unexpected (non-canonical) active codes → the set does not match the canonical model.
  for (const r of active) {
    if (!isCanonicalStageCode(r.code)) {
      reasons.push(`unexpected non-canonical stage code "${r.code}"`);
    }
  }

  // 2. Each canonical code must appear exactly once, with a numeric sequence.
  const byCode = new Map<CanonicalStageCode, NormalizedRow[]>();
  for (const r of active) {
    if (isCanonicalStageCode(r.code)) {
      const list = byCode.get(r.code) ?? [];
      list.push(r);
      byCode.set(r.code, list);
    }
  }
  for (const code of CANONICAL_STAGE_CODES) {
    const matches = byCode.get(code) ?? [];
    if (matches.length === 0) {
      reasons.push(`missing stage ${code}`);
      continue;
    }
    if (matches.length > 1) {
      reasons.push(`duplicate stage ${code} (${matches.length} active rows)`);
      continue;
    }
    if (typeof matches[0]!.sequence !== 'number') {
      reasons.push(`stage ${code} has no cr664_sequence (not yet seeded)`);
    }
  }

  // 3. Sequences must be unique across the resolved stages.
  const seqOwner = new Map<number, CanonicalStageCode>();
  for (const code of CANONICAL_STAGE_CODES) {
    const m = byCode.get(code);
    if (!m || m.length !== 1) continue;
    const seq = m[0]!.sequence;
    if (typeof seq !== 'number') continue;
    const existing = seqOwner.get(seq);
    if (existing) {
      reasons.push(`sequence ${seq} is shared by ${existing} and ${code}`);
    } else {
      seqOwner.set(seq, code);
    }
  }

  if (reasons.length > 0) {
    // De-dup while preserving order.
    return { status: 'unavailable', reasons: [...new Set(reasons)] };
  }

  // Build the ordered set (ascending by the data-defined sequence — NOT by code order).
  const ordered: { code: CanonicalStageCode; name: string; sequence: number }[] = [];
  for (const code of CANONICAL_STAGE_CODES) {
    const r = byCode.get(code)![0]!;
    ordered.push({ code, name: r.name || code, sequence: r.sequence! });
  }
  ordered.sort((a, b) => a.sequence - b.sequence);

  const maxSequence = ordered[ordered.length - 1]!.sequence;
  const stages: OrderedStage[] = ordered.map((s) => ({
    code: s.code,
    name: s.name,
    sequence: s.sequence,
    terminal: s.sequence === maxSequence,
  }));

  const byCodeMap = new Map<CanonicalStageCode, OrderedStage>(stages.map((s) => [s.code, s]));
  const indexByCode = new Map<CanonicalStageCode, number>(stages.map((s, i) => [s.code, i]));

  return {
    status: 'ready',
    stages,
    nextStage(current) {
      const i = indexByCode.get(current);
      if (i === undefined) return undefined;
      return stages[i + 1];
    },
    priorStages(current) {
      const i = indexByCode.get(current);
      if (i === undefined) return [];
      return stages.slice(0, i);
    },
    isTerminal(stage) {
      return byCodeMap.get(stage)?.terminal === true;
    },
    stageBySequence() {
      return new Map(stages.map((s) => [s.sequence, s]));
    },
    stageByCode(code) {
      return byCodeMap.get(code);
    },
  };
}
