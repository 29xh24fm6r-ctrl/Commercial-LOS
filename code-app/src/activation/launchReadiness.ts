/**
 * Phase 212–224 — shared launch-readiness primitive.
 *
 * PURE. Every capability in the full-system activation arc reports readiness the
 * same way: a list of named gate requirements, each satisfied or not, reduced to a
 * single fail-closed level with the EXACT unmet blockers. A capability is
 * `launch-ready` only when every requirement is satisfied; otherwise it is
 * `blocked` and names why. Nothing is inferred or fabricated.
 */

export type LaunchReadinessLevel = 'launch-ready' | 'blocked';

export interface GateRequirement {
  readonly name: string;
  readonly satisfied: boolean;
  /** Extra detail shown when this requirement is unsatisfied. */
  readonly detail?: string;
}

export interface CapabilityReadiness {
  readonly capability: string;
  readonly level: LaunchReadinessLevel;
  /** Exact unmet requirements (with detail when supplied). */
  readonly blockers: string[];
  /** Names of satisfied requirements. */
  readonly satisfied: string[];
}

export function evaluateLaunchGates(
  capability: string,
  requirements: ReadonlyArray<GateRequirement>,
): CapabilityReadiness {
  const blockers: string[] = [];
  const satisfied: string[] = [];
  for (const r of requirements) {
    if (r.satisfied === true) satisfied.push(r.name);
    else blockers.push(r.detail ? `${r.name}: ${r.detail}` : r.name);
  }
  return {
    capability,
    level: blockers.length === 0 ? 'launch-ready' : 'blocked',
    blockers,
    satisfied,
  };
}

/** True only when the readiness is launch-ready (no blockers). Fail-closed helper. */
export function isLaunchReady(r: CapabilityReadiness): boolean {
  return r.level === 'launch-ready' && r.blockers.length === 0;
}
