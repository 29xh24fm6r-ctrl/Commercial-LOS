import {
  deriveUnifiedCrmReadiness,
  type DeriveUnifiedCrmReadinessInput,
  type CrmReadinessDimensionKey,
  type UnifiedCrmReadiness,
} from '../readiness/unifiedCrmReadiness';

/**
 * CRM-J — final unified CRM team-readiness certification.
 *
 * The single, honest verdict on whether CRM is team-ready. It maps each named acceptance
 * criterion (from the factory arc CRM-B … CRM-I) to the unified readiness model's dimensions
 * and certifies ONLY when every criterion is met. It flips nothing, fakes nothing, and — like
 * the unified model — never certifies while the live-persistence smoke operator is
 * unattributable or while seed/linkage gaps remain. There is ONE readiness story.
 */

export interface CrmAcceptanceCriterion {
  readonly key: string;
  readonly requirement: string;
  readonly met: boolean;
  readonly backedBy: CrmReadinessDimensionKey;
  readonly detail: string;
}

export interface CrmTeamReadinessCertification {
  readonly certified: boolean;
  readonly criteria: readonly CrmAcceptanceCriterion[];
  readonly outstanding: readonly CrmAcceptanceCriterion[];
  readonly readiness: UnifiedCrmReadiness;
  readonly posture: string;
  /** The live hub + flag-gated spine are reconciled into one story (no parallel readiness). */
  readonly singleReadinessStory: true;
}

/** The exact acceptance criteria for "CRM team-ready", each backed by a unified dimension. */
const CRITERIA: ReadonlyArray<{ key: string; requirement: string; backedBy: CrmReadinessDimensionKey }> = [
  { key: 'command-center-routed', requirement: 'CRM Command Center is routed (not a hidden tab only).', backedBy: 'route-mount' },
  { key: 'roles-mounted', requirement: 'CRM is mounted for every required role (banker/team/manager/admin).', backedBy: 'team-scope' },
  { key: 'hub-spine-reconciled', requirement: 'Live CRM Hub and flag-gated spine readiness are reconciled (one story).', backedBy: 'flag-gated-spine' },
  { key: 'live-hub-operational', requirement: 'The live identity-gated CRM Hub reads and creates records.', backedBy: 'live-hub' },
  { key: 'full-schema-evidence', requirement: 'Full schema evidence is PASS: 10 tables / 147 columns / 28 relationships / 0 conflicts.', backedBy: 'schema-full-contract' },
  { key: 'runtime-hydration', requirement: 'Runtime hydration (tables + columns) hydrates from committed evidence.', backedBy: 'runtime-hydration' },
  { key: 'seed-and-linkage', requirement: 'Canonical seed/linkage is ready or exception-free, and new-deal → CRM client linkage is operational.', backedBy: 'seed-linkage' },
  { key: 'inline-edit-wired', requirement: 'Governed inline edit is wired (create + edit + audit + rollback).', backedBy: 'editing-writeback' },
  { key: 'authorization', requirement: 'Actor authorization is enforced (unauthorized access blocked).', backedBy: 'actor-authorization' },
  { key: 'operator-attribution', requirement: 'Operator attribution is HIGH confidence (no sentinel/unknown operator).', backedBy: 'certification-attribution' },
];

export function deriveCrmTeamReadinessCertification(
  input: DeriveUnifiedCrmReadinessInput = {},
): CrmTeamReadinessCertification {
  const readiness = deriveUnifiedCrmReadiness(input);
  const byKey = new Map(readiness.dimensions.map((d) => [d.key, d]));

  const criteria: CrmAcceptanceCriterion[] = CRITERIA.map((c) => {
    const dim = byKey.get(c.backedBy)!;
    return { key: c.key, requirement: c.requirement, met: dim.status === 'ready', backedBy: c.backedBy, detail: dim.detail };
  });

  const outstanding = criteria.filter((c) => !c.met);
  const certified = outstanding.length === 0;

  const posture = certified
    ? 'CRM is TEAM-READY: every acceptance criterion is met across the unified live hub and reconciled spine. New deals can be loaded for team use.'
    : `CRM is NOT yet team-ready — ${outstanding.length} criterion(s) outstanding: ${outstanding
        .map((o) => o.key)
        .join(', ')}. The remaining work is honestly blocked (no gate is faked). ${
        outstanding.length === 1 && outstanding[0].key === 'operator-attribution'
          ? 'Everything is wired, routed, mounted, seed/linkage-ready, and editable; the sole remaining gate is a real, attributable operator live-persistence smoke (replace the unknown-operator artifact).'
          : ''
      }`.trim();

  return {
    certified,
    criteria,
    outstanding,
    readiness,
    posture,
    singleReadinessStory: true,
  };
}
