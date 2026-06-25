import {
  EXPECTED_CRM_SCHEMA,
  type VerifiedCrmSchemaState,
} from '../crm/crmRuntimeSchemaGate';
import {
  EXPECTED_BOARDING_SCHEMA,
  type VerifiedBoardingSchemaState,
} from '../portfolioBoarding/portfolioBoardingRuntimeSchemaGate';

/**
 * Phase 246 — Runtime verified-state bridge.
 *
 * A PURE, READ-ONLY bridge that converts ACTUAL schema-verification evidence into the
 * runtime VerifiedCrmSchemaState / VerifiedBoardingSchemaState consumed by the
 * fail-closed runtime gates. It performs NO IO, NO Dataverse mutation, and flips NO
 * flag. It NEVER fabricates a verified state: it returns the measured schema state ONLY
 * when the evidence proves a complete, fresh, all-live PASS; otherwise it fails closed
 * (returns null with stated blockers).
 *
 * Why this exists: Phase 244/245 proved the CRM + portfolio generated services and data
 * sources are registered (services 5/5, datasources 5/5; 13/13), but verify-full-schema
 * reported live=0/0 — the live Dataverse EntityDefinitions check did not run — so no
 * VerifiedSchemaState could be hydrated and the runtime cutover stayed fail-closed. This
 * bridge defines the EXACT evidence that would hydrate runtime verified state, and proves
 * the current live=0/0 evidence does NOT.
 *
 * Hydration requires ALL of:
 *   - STATUS = PASS,
 *   - generated services found === expected (and expected === the plan table count),
 *   - data sources found === expected,
 *   - live tables: checked > 0 (no zero-total), found === checked, checked === expected,
 *   - measured schema MEETS the plan (tables/columns/required-relationships) with zero
 *     conflicts,
 *   - evidence is fresh (when a clock is supplied) and carries a parseable timestamp.
 */

export type SchemaVerificationStatus = 'PASS' | 'BLOCKED' | 'UNKNOWN';

interface CountPair {
  readonly found: number;
  readonly expected: number;
}

interface LiveCount {
  /** Tables confirmed live in Dataverse (EntityDefinitions). */
  readonly found: number;
  /** Tables the live check actually ran against. 0 = live check did not run. */
  readonly checked: number;
}

/** The measured CRM schema state (what the runtime gate consumes). */
export interface CrmMeasuredSchema {
  readonly tablesFound: number;
  readonly columnsFound: number;
  readonly relationshipsFound: number;
  readonly conflicts: number;
}

export interface CrmSchemaVerificationEvidence {
  readonly status: SchemaVerificationStatus;
  readonly services: CountPair;
  readonly dataSources: CountPair;
  readonly liveTables: LiveCount;
  /** Present only when a real schema comparison ran; absent → cannot hydrate. */
  readonly measured?: CrmMeasuredSchema;
  /** ISO timestamp the evidence was produced. Missing/unparseable → fails closed. */
  readonly verifiedAtIso?: string;
}

export interface BoardingMeasuredSchema {
  readonly tablesFound: number;
  readonly columnsFound: number;
  readonly requiredRelationshipsFound: number;
  readonly optionalRelationshipsFound: number;
  readonly conflicts: number;
}

export interface BoardingSchemaVerificationEvidence {
  readonly status: SchemaVerificationStatus;
  readonly services: CountPair;
  readonly dataSources: CountPair;
  readonly liveTables: LiveCount;
  readonly measured?: BoardingMeasuredSchema;
  readonly verifiedAtIso?: string;
}

export interface HydrationResult<T> {
  readonly hydrated: boolean;
  readonly verified: T | null;
  readonly blockers: readonly string[];
}

export interface HydrationOptions {
  /** Current epoch ms; when provided, freshness is enforced. */
  readonly nowEpochMs?: number;
  /** Max evidence age in ms (default 24h). */
  readonly maxAgeMs?: number;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Shared table-level + freshness guards. Returns the blockers (empty = ok). */
function tableLevelBlockers(
  ev: { status: SchemaVerificationStatus; services: CountPair; dataSources: CountPair; liveTables: LiveCount; verifiedAtIso?: string },
  expectedTables: number,
  opts: HydrationOptions,
): string[] {
  const b: string[] = [];
  if (ev.status !== 'PASS') b.push(`status is ${ev.status}, not PASS`);
  if (ev.services.expected !== expectedTables || ev.services.found !== ev.services.expected) {
    b.push(`services ${ev.services.found}/${ev.services.expected} (expected ${expectedTables}/${expectedTables})`);
  }
  if (ev.dataSources.expected !== expectedTables || ev.dataSources.found !== ev.dataSources.expected) {
    b.push(`datasources ${ev.dataSources.found}/${ev.dataSources.expected} (expected ${expectedTables}/${expectedTables})`);
  }
  if (ev.liveTables.checked <= 0) {
    b.push(`live=${ev.liveTables.found}/${ev.liveTables.checked} — live check did not run (zero-total)`);
  } else if (ev.liveTables.found !== ev.liveTables.checked || ev.liveTables.checked !== expectedTables) {
    b.push(`live=${ev.liveTables.found}/${ev.liveTables.checked} (expected ${expectedTables}/${expectedTables})`);
  }
  // Freshness: a parseable timestamp is required; staleness checked when a clock is given.
  const parsed = ev.verifiedAtIso ? Date.parse(ev.verifiedAtIso) : NaN;
  if (!ev.verifiedAtIso || Number.isNaN(parsed)) {
    b.push('missing or unparseable verifiedAtIso');
  } else if (opts.nowEpochMs !== undefined) {
    const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    if (opts.nowEpochMs - parsed > maxAge) b.push('evidence exceeds the freshness window (stale)');
    if (parsed - opts.nowEpochMs > maxAge) b.push('evidence timestamp is in the future');
  }
  return b;
}

export function hydrateVerifiedCrmSchemaState(
  evidence: CrmSchemaVerificationEvidence,
  opts: HydrationOptions = {},
): HydrationResult<VerifiedCrmSchemaState> {
  const blockers = tableLevelBlockers(evidence, EXPECTED_CRM_SCHEMA.tables, opts);
  const m = evidence.measured;
  if (!m) {
    blockers.push('no measured schema (column/relationship verification absent)');
  } else {
    if (m.conflicts > 0) blockers.push(`${m.conflicts} schema conflict(s)`);
    if (m.tablesFound < EXPECTED_CRM_SCHEMA.tables) blockers.push(`measured ${m.tablesFound}/${EXPECTED_CRM_SCHEMA.tables} tables`);
    if (m.columnsFound < EXPECTED_CRM_SCHEMA.columns) blockers.push(`measured ${m.columnsFound}/${EXPECTED_CRM_SCHEMA.columns} columns`);
  }
  if (blockers.length > 0 || !m) return { hydrated: false, verified: null, blockers };
  return {
    hydrated: true,
    verified: {
      tablesFound: m.tablesFound,
      columnsFound: m.columnsFound,
      relationshipsFound: m.relationshipsFound,
      conflicts: m.conflicts,
    },
    blockers: [],
  };
}

export function hydrateVerifiedBoardingSchemaState(
  evidence: BoardingSchemaVerificationEvidence,
  opts: HydrationOptions = {},
): HydrationResult<VerifiedBoardingSchemaState> {
  const blockers = tableLevelBlockers(evidence, EXPECTED_BOARDING_SCHEMA.tables, opts);
  const m = evidence.measured;
  if (!m) {
    blockers.push('no measured schema (column/relationship verification absent)');
  } else {
    if (m.conflicts > 0) blockers.push(`${m.conflicts} schema conflict(s)`);
    if (m.tablesFound < EXPECTED_BOARDING_SCHEMA.tables) blockers.push(`measured ${m.tablesFound}/${EXPECTED_BOARDING_SCHEMA.tables} tables`);
    if (m.columnsFound < EXPECTED_BOARDING_SCHEMA.columns) blockers.push(`measured ${m.columnsFound}/${EXPECTED_BOARDING_SCHEMA.columns} columns`);
    if (m.requiredRelationshipsFound < EXPECTED_BOARDING_SCHEMA.requiredRelationships) {
      blockers.push(`measured ${m.requiredRelationshipsFound}/${EXPECTED_BOARDING_SCHEMA.requiredRelationships} required relationships`);
    }
  }
  if (blockers.length > 0 || !m) return { hydrated: false, verified: null, blockers };
  return {
    hydrated: true,
    verified: {
      tablesFound: m.tablesFound,
      columnsFound: m.columnsFound,
      requiredRelationshipsFound: m.requiredRelationshipsFound,
      optionalRelationshipsFound: m.optionalRelationshipsFound,
      conflicts: m.conflicts,
    },
    blockers: [],
  };
}

/**
 * The ACTUAL recorded verification evidence, transcribed from
 * scripts/dataverse/export-runtime-schema-evidence.ps1 (Phase 252 token-backed
 * measurement). A real Dataverse Web API token (Connect-AzAccount + Get-AzAccessToken,
 * WhoAmI 200) measured the live schema in Matthew Paller's Environment: every expected
 * table is live (CRM 5/5, portfolio 13/13). BUT the live schema is the MINIMAL deployment
 * spine, incomplete vs the runtime plan: CRM has 5/10 plan tables and 40/147 plan columns;
 * portfolio has 13/13 tables but only ~15/219 columns and 0/12 required relationships. So
 * this evidence still does NOT hydrate runtime verified state — the bridge fails closed on
 * the schema-completeness gap. These are committed facts, not a fabricated PASS — the
 * verifier output (scripts/dataverse/evidence/runtime-schema-evidence.*.json) carries the
 * same values.
 */
export const CURRENT_CRM_VERIFICATION_EVIDENCE: CrmSchemaVerificationEvidence = Object.freeze({
  status: 'PASS',
  services: { found: 5, expected: 5 },
  dataSources: { found: 5, expected: 5 },
  liveTables: { found: 5, checked: 5 },
  measured: { tablesFound: 5, columnsFound: 40, relationshipsFound: 0, conflicts: 0 },
  verifiedAtIso: '2026-06-25T12:24:31-04:00',
});

export const CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE: BoardingSchemaVerificationEvidence = Object.freeze({
  status: 'PASS',
  services: { found: 13, expected: 13 },
  dataSources: { found: 13, expected: 13 },
  liveTables: { found: 13, checked: 13 },
  measured: { tablesFound: 13, columnsFound: 15, requiredRelationshipsFound: 0, optionalRelationshipsFound: 0, conflicts: 0 },
  verifiedAtIso: '2026-06-25T12:24:31-04:00',
});
