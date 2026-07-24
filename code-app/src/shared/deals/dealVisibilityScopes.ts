/**
 * P0-4 — canonical, documented deal-visibility scopes + a safe team/manager fallback.
 *
 * The audit found Banker (~18-19 active) and Team/Manager (~5-6) counts irreconcilable because a
 * deal without an OPTIONAL Owning Team (`cr664_Team`) was silently dropped from Team/Manager
 * oversight (those queries filter strictly on `_cr664_team_value eq <teamId>`), while the Banker
 * dashboard scopes on `_cr664_assignedbanker_value` and so still showed it.
 *
 * This module is the single documented source of truth for what each scope means, so the counts are
 * reconcilable and any intentional difference is LABELLED, and provides the pure OData-filter builder
 * that lets Team/Manager also include a deal assigned to one of their bankers even when its Owning
 * Team was skipped — so legitimate active deals never disappear from management oversight.
 */

export type DealVisibilityScopeId = 'banker' | 'team' | 'manager' | 'portfolio';

export interface DealVisibilityScope {
  readonly id: DealVisibilityScopeId;
  readonly label: string;
  /** Banker-facing, plain-language description of exactly which deals this count includes. */
  readonly description: string;
  /** The primary Dataverse predicate (documentation; the loaders build the live filter). */
  readonly primaryPredicate: string;
}

/**
 * The canonical scopes. Banker is deliberately PERSONAL (my assigned deals); Team/Manager are
 * team-oversight and are INTENTIONALLY BROADER — they include every deal owned by the team AND every
 * active deal assigned to one of the team's bankers (the Owning-Team fallback), so a deal with no
 * Owning Team still appears in oversight. Portfolio is the boarded/servicing book. These differences
 * are intentional and labelled here.
 */
export const DEAL_VISIBILITY_SCOPES: Readonly<Record<DealVisibilityScopeId, DealVisibilityScope>> = Object.freeze({
  banker: {
    id: 'banker',
    label: 'My active deals',
    description: 'Active, non-terminal deals assigned to me (excludes test/smoke records).',
    primaryPredicate: '_cr664_assignedbanker_value eq <myBankerId>',
  },
  team: {
    id: 'team',
    label: 'Team active deals',
    description:
      "Active, non-terminal deals owned by the team OR assigned to one of the team's bankers " +
      '(so a deal whose Owning Team was skipped still appears). Broader than "My active deals" by design.',
    primaryPredicate: '_cr664_team_value eq <teamId> OR _cr664_assignedbanker_value in <teamMemberIds>',
  },
  manager: {
    id: 'manager',
    label: 'Team oversight',
    description:
      'Manager oversight of the same team scope as "Team active deals" — owned by the team or ' +
      'assigned to a team banker. Reconciles with the Team count; sums of banker counts roll up here.',
    primaryPredicate: '_cr664_team_value eq <teamId> OR _cr664_assignedbanker_value in <teamMemberIds>',
  },
  portfolio: {
    id: 'portfolio',
    label: 'Portfolio (boarded) book',
    description:
      'Boarded/servicing loans in the portfolio — a DIFFERENT population from the origination ' +
      'pipeline above (post-close). Intentionally not equal to Banker/Team origination counts.',
    primaryPredicate: 'portfolio boarded-loan records (post-origination)',
  },
});

const GUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * Factory Arc Phase 6 — the canonical Dataverse OData predicate for "active, non-terminal" on
 * cr664_loandeal (statecode 0 = Active, and not flagged terminal). Before this phase, this exact
 * predicate was independently retyped in banker/dealQueries.ts and (twice) in
 * executive/operationalFallbackQueries.ts — four copies of the same literal string with no shared
 * source. That's precisely the shape of bug this module's header describes: every surface that
 * counts "active deals" must use the IDENTICAL predicate or counts silently drift apart the moment
 * one copy is edited and the others aren't. Every one of those call sites now imports this constant
 * instead of retyping it; `dealVisibilityScopesCanonicalPredicate.test.ts` pins that they do.
 */
export const ACTIVE_DEAL_ODATA_PREDICATE =
  'statecode eq 0 and (cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)';

/**
 * Build the OData filter for the Team/Manager active-deal scope. Always includes deals owned by the
 * team; when `memberBankerIds` is supplied it ALSO includes active deals assigned to any of those
 * bankers — the Owning-Team fallback, so a deal with no Owning Team still surfaces to oversight.
 * All ids are GUID-guarded (also blocks OData-filter injection).
 */
export function buildTeamVisibilityFilter(
  teamId: string,
  options: { readonly memberBankerIds?: readonly string[] } = {},
): string {
  const clauses: string[] = [];
  if (GUID_RE.test(teamId.trim())) clauses.push(`_cr664_team_value eq ${teamId.trim()}`);
  for (const id of options.memberBankerIds ?? []) {
    if (GUID_RE.test(id.trim())) clauses.push(`_cr664_assignedbanker_value eq ${id.trim()}`);
  }
  // No valid scoping id at all → fall back to the team-only clause shape (never an unscoped query).
  const scope = clauses.length > 0 ? `(${clauses.join(' or ')})` : `_cr664_team_value eq ${teamId}`;
  return `${scope} and ${ACTIVE_DEAL_ODATA_PREDICATE}`;
}
