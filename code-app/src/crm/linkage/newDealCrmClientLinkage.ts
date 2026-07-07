/**
 * CRM-F — new-deal → canonical CRM client linkage (governed required step).
 *
 * PURE and READ-ONLY decision model. It is the governed step the new-deal flow runs so a
 * new deal is linked to an EXISTING canonical CRM client instead of leaving CRM linkage
 * default-off/inert. It NEVER creates a client: it either links to a canonical client the
 * banker selected, or returns an actionable blocked state (select an existing client, or
 * create one first through the identity-gated governed CRM create). No fake client is ever
 * fabricated, and no flag-gated spine write is required — the actual deal↔client edge is
 * written through the same identity-gated relationship path the live CRM Hub already uses.
 */

export type NewDealCrmLinkStatus =
  | 'linked'
  | 'governed-create-required'
  | 'blocked-no-client-selected'
  | 'blocked-client-not-canonical';

export interface CanonicalCrmClientRef {
  readonly id: string;
  readonly name: string;
}

export interface NewDealCrmClientLinkInput {
  /** The canonical client id the banker selected for the new deal (from the authorized list). */
  readonly selectedClientId?: string | null;
  /** A free-text client name entered when no canonical id was selected. */
  readonly selectedClientName?: string | null;
  /** The authorized canonical CRM clients available to link — measured, never invented. */
  readonly canonicalClients: readonly CanonicalCrmClientRef[];
  /** The banker explicitly asked to create a NEW canonical client via governed CRM create. */
  readonly requestGovernedClientCreate?: boolean;
}

export interface NewDealCrmClientLink {
  readonly status: NewDealCrmLinkStatus;
  /** Linkage is a REQUIRED step in the governed new-deal flow. */
  readonly required: true;
  readonly linkedClientId: string | null;
  readonly linkedClientName: string | null;
  /** Always false — this step never fabricates a client. */
  readonly fabricated: false;
  readonly blocked: boolean;
  /** The concrete operator action when blocked (null when linked). */
  readonly actionRequired: string | null;
}

export function resolveNewDealCrmClientLink(
  input: NewDealCrmClientLinkInput,
): NewDealCrmClientLink {
  const base = { required: true as const, fabricated: false as const };

  // 1. A selected canonical id that resolves to an authorized client → linked.
  const selectedId = (input.selectedClientId ?? '').trim();
  if (selectedId) {
    const match = input.canonicalClients.find((c) => c.id === selectedId);
    if (match) {
      return { ...base, status: 'linked', linkedClientId: match.id, linkedClientName: match.name, blocked: false, actionRequired: null };
    }
    return {
      ...base,
      status: 'blocked-client-not-canonical',
      linkedClientId: null,
      linkedClientName: null,
      blocked: true,
      actionRequired: 'Selected client is not an authorized canonical CRM client. Pick an existing CRM client or create one via governed CRM create.',
    };
  }

  // 2. Explicit governed-create request → must create the client first (never auto-faked here).
  if (input.requestGovernedClientCreate === true) {
    return {
      ...base,
      status: 'governed-create-required',
      linkedClientId: null,
      linkedClientName: (input.selectedClientName ?? '').trim() || null,
      blocked: true,
      actionRequired: 'Create the canonical CRM client through the identity-gated governed CRM create (Add Company), then link the deal to it. No client is created by this step.',
    };
  }

  // 3. A free-text name with no canonical match → not-canonical (never auto-created).
  const name = (input.selectedClientName ?? '').trim();
  if (name) {
    return {
      ...base,
      status: 'blocked-client-not-canonical',
      linkedClientId: null,
      linkedClientName: null,
      blocked: true,
      actionRequired: `No canonical CRM client matches "${name}". Select an existing CRM client or create one via governed CRM create before creating the deal.`,
    };
  }

  // 4. Nothing selected → actionable blocked state.
  return {
    ...base,
    status: 'blocked-no-client-selected',
    linkedClientId: null,
    linkedClientName: null,
    blocked: true,
    actionRequired: 'Select an existing CRM client (or create one via governed CRM create) before creating the deal.',
  };
}

/** Linkage is a required, wired step in the new-deal flow (no longer default-off/inert). */
export const NEW_DEAL_CRM_LINKAGE_REQUIRED = true;

/** True only when the new deal is linked to a canonical CRM client and may proceed. */
export function newDealCrmLinkSatisfied(link: NewDealCrmClientLink): boolean {
  return link.status === 'linked' && link.linkedClientId !== null;
}
