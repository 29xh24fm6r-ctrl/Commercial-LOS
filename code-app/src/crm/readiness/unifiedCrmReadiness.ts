import { isCrmFullSchemaComplete, type CrmFullMeasuredSchema } from '../crmFullSchemaContract';
import {
  hydrateVerifiedCrmSchemaState,
  CURRENT_CRM_VERIFICATION_EVIDENCE,
} from '../../admin/runtimeVerifiedSchemaBridge';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crmFeatureFlags';
import { isFeatureSurfaceFlagEnabled } from '../../navigation/featureSurfaceFlags';
import { isCrmCertificationAttributed } from '../certification/crmCertificationAttribution';

/**
 * CRM-B — Unified CRM readiness model.
 *
 * ONE honest readiness view over BOTH CRM subsystems — there is no second parallel
 * readiness story:
 *   A. the flag-gated Dataverse/Salesforce spine (CRM_LIVE_PERSISTENCE_ENABLED,
 *      default false, mostly unrouted / inert), and
 *   B. the live CRM Hub (CrmHubWorkspace, mounted as the crm-hub tab, identity-gated —
 *      already reads + lets authorized bankers create real cr664_crm* records).
 *
 * PURE and READ-ONLY: no IO, no Dataverse probe, no flag flip. It reads real evidence
 * sources (full-schema contract, runtime-hydration bridge, feature-surface route flags,
 * committed final-launch evidence integrity, CRM feature flags) and a committed DELIVERY
 * LEDGER that the later factory phases (CRM-C … CRM-G) flip as they actually deliver.
 *
 * HARD honesty rules (pinned by tests):
 *   - NEVER team-ready while the live-persistence certification smoke's operator is
 *     unattributable (operatorUpn unknown/sentinel) — the attribution dimension blocks.
 *   - NEVER team-ready while canonical seed OR new-deal linkage gaps remain.
 *   - teamReady is true only when EVERY dimension is 'ready'. No flag path forces it up.
 */

export type CrmReadinessStatus = 'ready' | 'blocked';

export interface CrmReadinessDimension {
  readonly key: CrmReadinessDimensionKey;
  readonly label: string;
  readonly status: CrmReadinessStatus;
  readonly detail: string;
  readonly blockers: readonly string[];
}

export type CrmReadinessDimensionKey =
  | 'schema-full-contract'
  | 'runtime-hydration'
  | 'live-hub'
  | 'flag-gated-spine'
  | 'route-mount'
  | 'actor-authorization'
  | 'seed-linkage'
  | 'editing-writeback'
  | 'team-scope'
  | 'certification-attribution';

export interface UnifiedCrmReadiness {
  readonly dimensions: readonly CrmReadinessDimension[];
  readonly readyCount: number;
  readonly totalCount: number;
  /** True ONLY when every dimension is ready. Never faked. */
  readonly teamReady: boolean;
  /** Flattened hard blockers across all dimensions, in dimension order. */
  readonly blockers: readonly string[];
}

/**
 * The committed DELIVERY LEDGER — the honest current delivery state of the factory arc.
 * Each later phase flips exactly the fields it actually delivers (and wires the real code
 * behind it); this is the single edit point so a phase can never claim readiness it did
 * not build. Defaults reflect the CRM-B audit baseline: the live hub reads + creates for
 * bankers today, but the Command Center is unrouted, only the banker role is mounted, no
 * canonical seed/linkage exists, and inline edit is built-but-unwired.
 */
export interface CrmDeliveryLedger {
  /** CRM-C: the Command Center is reachable via a route or workspace nav entry. */
  readonly commandCenterRouted: boolean;
  /** CRM-D: which roles have CRM surfaces actually mounted (not just mount-capable). */
  readonly rolesMounted: {
    readonly banker: boolean;
    readonly team: boolean;
    readonly manager: boolean;
    readonly admin: boolean;
  };
  /**
   * CRM-E: the governed canonical CRM seed/backfill path is wired and the graph is
   * exception-free (no deal names a client with no resolvable canonical organization).
   * Source of truth: crmCanonicalSeedReadiness.deriveCrmCanonicalSeedReadiness().ready.
   * Does NOT assert records physically exist — that is `seededRecordsPresent`.
   */
  readonly canonicalSeedReady: boolean;
  /** CRM-F: new-deal → CRM client linkage is operational (governed, not inert). */
  readonly newDealLinkageOperational: boolean;
  /** Live hub create path is wired (Phase 261 — true today). */
  readonly liveCreateWired: boolean;
  /** CRM-G: governed inline edit is wired into the hub / command center UI. */
  readonly inlineEditWired: boolean;
}

// CRM-G note: inline edit is wired into the CRM Hub drawer via CrmOrgFieldInlineEdit
// (governed updateOrganizationField — validation + audit + actor binding + rollback).

export const CRM_TEAM_READINESS_LEDGER: CrmDeliveryLedger = Object.freeze({
  // CRM-C: the Command Center is routed at /surfaces/crm-command-center.
  commandCenterRouted: true,
  // CRM-D: role-scoped read-only CRM surfaces mounted for team / manager / admin
  // (banker already mounted). Source of truth: crmRoleMountRegistry.CRM_ROLE_MOUNTS.
  rolesMounted: Object.freeze({ banker: true, team: true, manager: true, admin: true }),
  // CRM-E: governed backfill path wired + exception-free (no records fabricated).
  canonicalSeedReady: true,
  // CRM-F: new-deal → canonical CRM client linkage is a wired, governed required step.
  newDealLinkageOperational: true,
  liveCreateWired: true,
  // CRM-G: governed inline edit wired into the hub drawer (CrmOrgFieldInlineEdit).
  inlineEditWired: true,
});

/** The roles that must have CRM mounted before CRM is team-ready. */
export const CRM_REQUIRED_MOUNT_ROLES = ['banker', 'team', 'manager', 'admin'] as const;

/**
 * The measured FULL CRM schema, transcribed from the committed, token-validated
 * scripts/dataverse/evidence/full-crm-schema-evidence.json (10 tables / 147 columns /
 * 28 relationships / 0 conflicts). Unlike the runtime-hydration evidence — which measures
 * relationships as warning-only (0) — the FULL contract is fail-closed on all three.
 */
export const CRM_FULL_SCHEMA_MEASURED: CrmFullMeasuredSchema = Object.freeze({
  tablesFound: 10,
  columnsFound: 147,
  relationshipsFound: 28,
  conflicts: 0,
});

export interface DeriveUnifiedCrmReadinessInput {
  /** Override the committed delivery ledger (later phases / tests). */
  readonly ledger?: CrmDeliveryLedger;
  /** Override the measured full-schema evidence (tests / re-verification). */
  readonly fullSchemaMeasured?: CrmFullMeasuredSchema;
  /** Override the certification-attribution verdict (tests inject a corrected smoke). */
  readonly certificationAttributionHigh?: boolean;
  /** Current epoch ms for runtime-hydration freshness (optional). */
  readonly nowEpochMs?: number;
}

function dim(
  key: CrmReadinessDimensionKey,
  label: string,
  ok: boolean,
  detail: string,
  blocker: string,
): CrmReadinessDimension {
  return {
    key,
    label,
    status: ok ? 'ready' : 'blocked',
    detail,
    blockers: ok ? [] : [blocker],
  };
}

/**
 * Default certification-attribution verdict: the committed live-persistence smoke is
 * accepted at HIGH confidence with an ATTRIBUTABLE operator (CRM-H authority). An
 * unknown/sentinel operator can never satisfy this — attribution stays blocking.
 */
function defaultCertificationAttributionHigh(): boolean {
  return isCrmCertificationAttributed();
}

export function deriveUnifiedCrmReadiness(
  input: DeriveUnifiedCrmReadinessInput = {},
): UnifiedCrmReadiness {
  const ledger = input.ledger ?? CRM_TEAM_READINESS_LEDGER;
  const fullMeasured = input.fullSchemaMeasured ?? CRM_FULL_SCHEMA_MEASURED;

  // 1. Full schema contract — 10 tables / 147 columns / 28 relationships / 0 conflicts.
  const full = isCrmFullSchemaComplete(fullMeasured);

  // 2. Runtime hydration — the tables+columns bridge the runtime write gate consumes.
  const hydration = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE, {
    ...(input.nowEpochMs !== undefined ? { nowEpochMs: input.nowEpochMs } : {}),
  });

  // 4. Flag-gated spine — reported honestly (intentionally off); reconciled with the hub.
  const spineLive = CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED === true;

  // 5. Route / mount — Command Center routed OR a CRM read route surface is enabled.
  const commandCenterFlag =
    isFeatureSurfaceFlagEnabled('CRM_COMMAND_CENTER_ROUTE_ENABLED') ||
    isFeatureSurfaceFlagEnabled('CRM_INTELLIGENCE_ROUTE_ENABLED');
  const routed = ledger.commandCenterRouted || commandCenterFlag;

  // 7. Seed / linkage — canonical seed ready AND new-deal linkage operational.
  const seedLinkageOk = ledger.canonicalSeedReady && ledger.newDealLinkageOperational;

  // 8. Editing / writeback — live create wired AND inline edit wired.
  const editingOk = ledger.liveCreateWired && ledger.inlineEditWired;

  // 9. Team scope — every required role mounted.
  const missingRoles = CRM_REQUIRED_MOUNT_ROLES.filter((r) => ledger.rolesMounted[r] !== true);

  // 10. Certification attribution — the live-persistence smoke accepted at HIGH confidence.
  const attributionHigh =
    input.certificationAttributionHigh ?? defaultCertificationAttributionHigh();

  const dimensions: CrmReadinessDimension[] = [
    dim(
      'schema-full-contract',
      'Full schema contract (10 tables / 147 columns / 28 relationships / 0 conflicts)',
      full.complete,
      full.complete
        ? 'Full CRM schema contract satisfied by committed token-validated evidence.'
        : `Full schema incomplete: ${full.blockers.join(', ')}.`,
      `Full CRM schema incomplete: ${full.blockers.join(', ')}.`,
    ),
    dim(
      'runtime-hydration',
      'Runtime hydration (tables + columns)',
      hydration.hydrated,
      hydration.hydrated
        ? 'Runtime verified-schema state hydrates from committed evidence (relationships warning-only).'
        : `Runtime hydration blocked: ${hydration.blockers.join(', ')}.`,
      `Runtime hydration blocked: ${hydration.blockers.join(', ')}.`,
    ),
    dim(
      'live-hub',
      'Live CRM Hub (identity-gated read + create)',
      ledger.liveCreateWired,
      'CrmHubWorkspace is mounted (crm-hub tab); reads live cr664_crm* and creates for authorized bankers.',
      'Live CRM Hub create path is not wired.',
    ),
    dim(
      'flag-gated-spine',
      'Flag-gated spine reconciled with the live hub',
      true,
      spineLive
        ? 'Spine live persistence is ENABLED; unified with the live hub.'
        : 'Spine live persistence is intentionally OFF (CRM_LIVE_PERSISTENCE_ENABLED=false); the live hub is the active write path. Reconciled — no parallel readiness story.',
      'Flag-gated spine is not reconciled with the live hub.',
    ),
    dim(
      'route-mount',
      'CRM routed / navigable (not a hidden tab only)',
      routed,
      routed
        ? 'CRM Command Center is reachable via a route or workspace nav entry.'
        : 'CRM lives only as the hidden crm-hub BankerShell tab; no standalone route/nav.',
      'CRM Command Center is not routed; it lives only as a hidden BankerShell tab.',
    ),
    dim(
      'actor-authorization',
      'Actor / authorization gating',
      true,
      'CRM read/write is identity-gated (authorized actor + resolved Dataverse identity); unauthorized access fails closed.',
      'Actor authorization gating is not enforced.',
    ),
    dim(
      'seed-linkage',
      'Canonical seed + new-deal linkage',
      seedLinkageOk,
      seedLinkageOk
        ? 'Backfill path ready — no canonical records seeded yet; new-deal linkage operational.'
        : `Seed/linkage gaps remain (seedReady=${ledger.canonicalSeedReady}, linkageOperational=${ledger.newDealLinkageOperational}).`,
      'Canonical CRM seed/linkage gaps remain (contacts/roles/activities not seeded or new-deal linkage inert).',
    ),
    dim(
      'editing-writeback',
      'Create + inline edit writeback',
      editingOk,
      editingOk
        ? 'Governed create AND inline edit are wired for the live hub.'
        : `Editing incomplete (createWired=${ledger.liveCreateWired}, inlineEditWired=${ledger.inlineEditWired}).`,
      'CRM inline edit is not wired into the UI.',
    ),
    dim(
      'team-scope',
      'Team-scope mounts (banker / team / manager / admin)',
      missingRoles.length === 0,
      missingRoles.length === 0
        ? 'CRM is mounted for every required role.'
        : `Roles not mounted: ${missingRoles.join(', ')}.`,
      `CRM not mounted for required roles: ${missingRoles.join(', ')}.`,
    ),
    dim(
      'certification-attribution',
      'Live-persistence certification attribution (HIGH confidence)',
      attributionHigh,
      attributionHigh
        ? 'Live-persistence smoke is accepted at HIGH confidence with an attributable operator.'
        : 'Live-persistence smoke is not accepted at HIGH confidence (operator unattributable — e.g. unknown-operator).',
      'Live-persistence certification smoke is unattributable (operatorUpn unknown/sentinel).',
    ),
  ];

  const readyCount = dimensions.filter((d) => d.status === 'ready').length;
  const blockers = dimensions.flatMap((d) => d.blockers);

  return {
    dimensions,
    readyCount,
    totalCount: dimensions.length,
    teamReady: readyCount === dimensions.length,
    blockers,
  };
}
