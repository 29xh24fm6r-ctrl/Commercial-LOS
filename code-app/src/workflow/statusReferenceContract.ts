/**
 * Stage Advancement — canonical STATUS reference contract (Phase 5).
 *
 * The disposition counterpart to stageOrderingContract. Stages carry an ordering
 * (cr664_sequence); statuses are an unordered SET of dispositions. This resolves
 * the seeded `cr664_dealstatusreferences` rows against the canonical disposition
 * vocabulary — the same five `DealStatusCode`s the transition engine emits
 * (OPEN / ON_HOLD / DECLINED / WITHDRAWN / BOARDED) — and is FAIL-CLOSED: a
 * missing, duplicate, inactive, or non-canonical status yields an explicit
 * `unavailable` with reasons, never a guessed set.
 *
 * Pure and dependency-injected: callers pass the status-reference rows (loaded
 * from `Cr664_dealstatusreferencesService`). No I/O, no SDK import.
 */

import type { DealStatusCode } from './canonicalStageTransition';

/**
 * The canonical disposition codes. Typed against `DealStatusCode` so this list
 * cannot drift from the transition engine's status vocabulary, and mirrors the
 * STATUS_SEEDS in scripts/seed-stage-references.mjs (the maker's seed).
 */
export const CANONICAL_STATUS_CODES: readonly DealStatusCode[] = [
  'OPEN',
  'ON_HOLD',
  'DECLINED',
  'WITHDRAWN',
  'BOARDED',
];

const CANONICAL_STATUS_SET: ReadonlySet<string> = new Set(CANONICAL_STATUS_CODES);

export function isCanonicalStatusCode(value: string): value is DealStatusCode {
  return CANONICAL_STATUS_SET.has(value);
}

/** Structural shape of a status-reference row — a subset of the generated model. */
export interface StatusReferenceRow {
  readonly cr664_code?: string | null;
  readonly cr664_name?: string | null;
  readonly cr664_activeflag?: boolean | null;
}

export interface ResolvedStatus {
  readonly code: DealStatusCode;
  readonly name: string;
}

export type StatusReferenceResult =
  | { readonly status: 'ready'; readonly statuses: readonly ResolvedStatus[] }
  | { readonly status: 'unavailable'; readonly reasons: readonly string[] };

interface NormalizedStatusRow {
  code: string;
  name: string;
  active: boolean;
}

function normalize(rows: readonly StatusReferenceRow[]): NormalizedStatusRow[] {
  return rows.map((r) => ({
    code: (r.cr664_code ?? '').trim(),
    name: (r.cr664_name ?? '').trim(),
    // Active unless explicitly inactive (Dataverse may omit the default-true flag).
    active: r.cr664_activeflag !== false,
  }));
}

/**
 * Resolve the canonical disposition statuses from seeded rows. Fail-closed: each
 * canonical status must appear exactly once as an active row.
 */
export function resolveStatusReferences(rows: readonly StatusReferenceRow[]): StatusReferenceResult {
  const reasons: string[] = [];
  const active = normalize(rows).filter((r) => r.active && r.code.length > 0);

  // Unexpected (non-canonical) active status codes → the set does not match.
  for (const r of active) {
    if (!isCanonicalStatusCode(r.code)) {
      reasons.push(`unexpected non-canonical status code "${r.code}"`);
    }
  }

  const byCode = new Map<DealStatusCode, NormalizedStatusRow[]>();
  for (const r of active) {
    if (isCanonicalStatusCode(r.code)) {
      const list = byCode.get(r.code) ?? [];
      list.push(r);
      byCode.set(r.code, list);
    }
  }
  for (const code of CANONICAL_STATUS_CODES) {
    const matches = byCode.get(code) ?? [];
    if (matches.length === 0) {
      reasons.push(`missing status ${code} (not yet seeded / inactive)`);
    } else if (matches.length > 1) {
      reasons.push(`duplicate status ${code} (${matches.length} active rows)`);
    }
  }

  if (reasons.length > 0) {
    return { status: 'unavailable', reasons: [...new Set(reasons)] };
  }

  const statuses: ResolvedStatus[] = CANONICAL_STATUS_CODES.map((code) => {
    const r = byCode.get(code)![0]!;
    return { code, name: r.name || code };
  });
  return { status: 'ready', statuses };
}
