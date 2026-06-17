/**
 * Phase 189C — pure builder: authorized deal/workspace context -> the
 * CrmRelationshipGraphInput consumed by deriveCrmRelationshipViewModel.
 *
 * READ-ONLY and PURE. No IO, no Dataverse call, no SDK/client import. The
 * caller (a panel mounted in an already-authorized deal workspace) assembles
 * what it truthfully knows and hands it here; this function maps it 1:1 into
 * the view-model input without inventing edges.
 *
 * Honesty rules:
 *   - Only edges the caller actually supplies are emitted. An edge the workspace
 *     context does not load is simply absent (the view-model then reports it as
 *     a not-yet-linked edge — never a fabricated record).
 *   - When the canonical client is known only by display name (the deal
 *     workspace surfaces `clientName` but not the cr664_clientrelationship GUID),
 *     the surrogate id is prefixed `name:` so it is never mistaken for a real
 *     record id. A real id, when supplied, always wins.
 *   - Edge lookup classifications default to 'unknown' — this builder does not
 *     run the Phase 189A metadata probe, so it never claims an edge is a real
 *     lookup it did not verify.
 */

import type {
  CrmRelationshipGraphInput,
  CrmEdgeLookupClassification,
  CrmSpineTableKey,
} from './crmRelationshipViewModel';

export interface CrmRelationshipInputSource {
  /** The anchor Loan Deal (already authorized for the caller). */
  deal: { id: string; name?: string | null } | null;
  /** Canonical client id (cr664_clientrelationship), when known. */
  clientId?: string | null;
  /** Canonical client display name (cr664_Client formatted value). */
  clientName?: string | null;
  clientBorrowerType?: string | null;
  clientLookupClassification?: CrmEdgeLookupClassification;
  /** Assigned banker (cr664_loandeal.cr664_AssignedTo). */
  assignedBanker?: {
    id: string;
    name?: string | null;
    email?: string | null;
    teamId?: string | null;
    lookupClassification?: CrmEdgeLookupClassification;
  } | null;
  /** Owning team (cr664_loandeal.cr664_Team). */
  team?: {
    id: string;
    name?: string | null;
    lookupClassification?: CrmEdgeLookupClassification;
  } | null;
  /** Optional platform-user context. */
  platformUser?: {
    id: string;
    name?: string | null;
    coreUserId?: string | null;
    primaryWorkspaceId?: string | null;
    primaryWorkspaceName?: string | null;
  } | null;
  /** Live presence of future spine tables (from a schema gate), if observed. */
  spineTablePresence?: Partial<Record<CrmSpineTableKey, boolean>>;
}

/** Prefix marking an id that was derived from a display name, not a record id. */
export const CRM_NAME_REF_PREFIX = 'name:';

export function buildCrmRelationshipInput(
  source: CrmRelationshipInputSource,
): CrmRelationshipGraphInput {
  const deal = source.deal
    ? { id: source.deal.id, name: source.deal.name ?? null }
    : null;

  // Canonical client: prefer a real id; otherwise fall back to a clearly
  // name-derived surrogate so the edge can render without faking a GUID.
  let client: CrmRelationshipGraphInput['client'] = null;
  const clientRef =
    source.clientId != null && source.clientId !== ''
      ? source.clientId
      : source.clientName
        ? `${CRM_NAME_REF_PREFIX}${source.clientName}`
        : null;
  if (clientRef) {
    client = {
      id: clientRef,
      name: source.clientName ?? null,
      borrowerType: source.clientBorrowerType ?? null,
      lookupClassification: source.clientLookupClassification ?? 'unknown',
    };
  }

  const team = source.team
    ? {
        id: source.team.id,
        name: source.team.name ?? null,
        lookupClassification: source.team.lookupClassification ?? 'unknown',
      }
    : null;

  const assignedBanker = source.assignedBanker
    ? {
        id: source.assignedBanker.id,
        name: source.assignedBanker.name ?? null,
        email: source.assignedBanker.email ?? null,
        teamId: source.assignedBanker.teamId ?? null,
        lookupClassification: source.assignedBanker.lookupClassification ?? 'unknown',
      }
    : null;

  const platformUser = source.platformUser
    ? {
        id: source.platformUser.id,
        name: source.platformUser.name ?? null,
        coreUserId: source.platformUser.coreUserId ?? null,
        primaryWorkspaceId: source.platformUser.primaryWorkspaceId ?? null,
        primaryWorkspaceName: source.platformUser.primaryWorkspaceName ?? null,
      }
    : null;

  return {
    deal,
    client,
    team,
    assignedBanker,
    platformUser,
    spineTablePresence: source.spineTablePresence,
  };
}
