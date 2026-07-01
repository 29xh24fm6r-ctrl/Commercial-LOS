import {
  addRelationship,
  type AddRelationshipInput,
  type CrmActor,
  type CrmWriteDeps,
  type CrmWriteOutcome,
} from '../write/crmWriteAdapter';
import { isValidAdvisorRole } from './advisorRoles';

/**
 * Advisor link (Phase 4) — capture *who works with* a client as a typed, governed
 * relationship: "Smith CPA → serves → Acme, role: CPA/Accountant". Reuses the
 * existing `cr664_crmrelationships` table (advisor = Source org, client = Target
 * org, role = `cr664_role`), through the same governed write path. An optional
 * `originatedDealId` scopes the link to a specific deal (the deal lookup
 * `cr664_OriginatedLoanDeal` already exists — so deal-level attribution works
 * with no schema change).
 */
export interface AddAdvisorLinkInput extends CrmActor {
  /** The advisor party (a Professional/Advisor company). */
  readonly advisorOrganizationId: string;
  /** The client being served. */
  readonly clientOrganizationId: string;
  /** Advisor role — validated against the advisor-role vocabulary. */
  readonly role: string;
  /** Optional: scope this advisor to a specific originated deal. */
  readonly originatedDealId?: string;
  readonly notes?: string;
  /** Optional display names, only used to derive a readable relationship name. */
  readonly advisorName?: string;
  readonly clientName?: string;
}

/** Build the governed relationship input for an advisor link (pure; validates role). */
export function buildAdvisorRelationshipInput(
  input: AddAdvisorLinkInput,
): { ok: true; value: AddRelationshipInput } | { ok: false; reason: string } {
  const role = input.role.trim();
  if (!isValidAdvisorRole(role)) {
    return { ok: false, reason: `"${role}" is not an allowed advisor role.` };
  }
  if (input.advisorOrganizationId.trim().length === 0) {
    return { ok: false, reason: 'An advisor party is required.' };
  }
  if (input.clientOrganizationId.trim().length === 0) {
    return { ok: false, reason: 'A client is required.' };
  }
  const advisorName = input.advisorName?.trim() || 'Advisor';
  const clientName = input.clientName?.trim() || 'Client';
  const name = `${advisorName} — ${role} → ${clientName}`;
  return {
    ok: true,
    value: {
      actorEmail: input.actorEmail,
      actorSystemUserId: input.actorSystemUserId,
      authorized: input.authorized,
      name,
      relationshipType: 'Advisor',
      role,
      sourceOrganizationId: input.advisorOrganizationId,
      targetOrganizationId: input.clientOrganizationId,
      originatedDealId: input.originatedDealId,
      notes: input.notes,
    },
  };
}

/** Create the advisor link through the governed write path (validate role → addRelationship). */
export async function addAdvisorLink(input: AddAdvisorLinkInput, deps: CrmWriteDeps): Promise<CrmWriteOutcome> {
  const built = buildAdvisorRelationshipInput(input);
  if (!built.ok) return { kind: 'invalid-input', reason: built.reason };
  return addRelationship(built.value, deps);
}
