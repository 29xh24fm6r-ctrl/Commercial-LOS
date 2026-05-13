import { Cr664_bankersService } from '../generated/services/Cr664_bankersService';
import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';

/**
 * Schema reality (verified before coding — see Entity XML inspection
 * notes in phase 14 commit message):
 *
 *  - cr664_Banker.cr664_ManagerName is nvarchar free text, NOT a lookup
 *    -> no clean banker->manager FK in the schema yet
 *  - cr664_Banker.cr664_Team is a lookup to cr664_Team
 *  - cr664_LoanDeal.cr664_Team is a lookup to cr664_Team
 *  - cr664_Team has no team-lead / manager FK
 *
 * Decision: scope manager data by Team. "The manager's team" is a clean
 * server-side scope using existing lookups on both Banker and LoanDeal.
 * Cross-team manager relationships are not modeled in the schema yet —
 * when they are, this scoping should be revisited.
 *
 * The current user's manager identity is resolved by finding their
 * cr664_Banker record by UPN, exactly the same way BankerProvider does.
 * If they have no banker record OR their banker has no team, we fall
 * back to a clear "not configured" state rather than over-broadening
 * to all deals (per the phase-14 guardrail).
 */

export interface ManagerIdentity {
  bankerId: string;
  fullName: string;
  email: string;
  teamId: string;
  teamName: string;
}

export type ManagerIdentityResult =
  | { kind: 'ready'; identity: ManagerIdentity }
  | { kind: 'not-banker' }
  | { kind: 'no-team' }
  | { kind: 'failed'; message: string };

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

export async function loadManagerIdentity(upn: string): Promise<ManagerIdentityResult> {
  const bankersResult = await Cr664_bankersService.getAll({
    filter: `cr664_email eq '${escapeOData(upn)}'`,
    top: 1,
  });

  if (!bankersResult.success) {
    return {
      kind: 'failed',
      message: bankersResult.error?.message ?? 'Failed to load banker record',
    };
  }

  const banker = bankersResult.data?.[0];
  if (!banker) return { kind: 'not-banker' };

  const teamId = banker._cr664_team_value;
  const teamName = banker.cr664_teamname;
  if (!teamId) return { kind: 'no-team' };

  return {
    kind: 'ready',
    identity: {
      bankerId: banker.cr664_bankerid,
      fullName: banker.cr664_fullname,
      email: banker.cr664_email ?? upn,
      teamId,
      teamName: teamName ?? '(unnamed team)',
    },
  };
}

export interface TeamDeal {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  modifiedOn: string | undefined;
  assignedBankerId: string | undefined;
  assignedBankerName: string | undefined;
}

/**
 * Active, non-terminal deals scoped to the given team. Uses the same
 * conservative filter as BankerProvider's pipeline (statecode eq 0,
 * isterminalstatus eq false/null) so the manager only sees deals that
 * are operationally in-flight.
 *
 * Ordered by target close date asc so the closing-forecast and
 * at-risk computations can stream from the same ordered list.
 */
export async function loadTeamPipeline(teamId: string): Promise<TeamDeal[]> {
  const result = await Cr664_loandealsService.getAll({
    filter: [
      `_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
      `(cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)`,
    ].join(' and '),
    orderBy: ['cr664_targetclosedate asc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team pipeline');
  }

  return (result.data ?? []).map(
    (d): TeamDeal => ({
      id: d.cr664_loandealid,
      name: d.cr664_dealname,
      clientName: d.cr664_clientname,
      stage: d.cr664_stagereferencename,
      status: d.cr664_statusreferencename,
      amount: d.cr664_amount,
      targetCloseDate: d.cr664_targetclosedate,
      stageEntryDate: d.cr664_stageentrydate,
      modifiedOn: d.modifiedon,
      assignedBankerId: d._cr664_assignedbanker_value,
      assignedBankerName: d.cr664_assignedbankername,
    }),
  );
}

export interface TeamBanker {
  id: string;
  fullName: string;
  email: string | undefined;
  roleType: string | undefined;
  active: boolean;
}

/**
 * Active bankers on the given team. Used for the workload-summary card
 * to enumerate everyone on the team (so a banker with zero deals still
 * shows as 0 of N, rather than disappearing).
 */
export async function loadTeamBankers(teamId: string): Promise<TeamBanker[]> {
  const result = await Cr664_bankersService.getAll({
    filter: [
      `_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_fullname asc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team bankers');
  }

  return (result.data ?? []).map(
    (b): TeamBanker => ({
      id: b.cr664_bankerid,
      fullName: b.cr664_fullname,
      email: b.cr664_email,
      roleType: b.cr664_roletypename,
      active: b.cr664_activeflag !== false,
    }),
  );
}
