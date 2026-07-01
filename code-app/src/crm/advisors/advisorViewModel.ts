import { isValidAdvisorRole } from './advisorRoles';

/**
 * Advisor relationship view models (Phase 5). Derives typed advisor links from raw
 * `cr664_crmrelationships` rows so two payoff views can render:
 *   - advisors on a client/deal, and
 *   - the reverse: the clients/deals a given advisor touches.
 *
 * Read-only + honest: a relationship is treated as an advisor link only when it is
 * tagged `relationshipType: 'Advisor'` or carries an on-list advisor role; missing
 * names/ids render as honest placeholders, never invented.
 */

/** Minimal projection of a relationship read row (denormalized name + id mirrors). */
export interface RelationshipRow {
  readonly cr664_role?: string;
  readonly cr664_relationshiptype?: string;
  readonly _cr664_sourceorganization_value?: string | null;
  readonly cr664_sourceorganizationname?: string | null;
  readonly _cr664_targetorganization_value?: string | null;
  readonly cr664_targetorganizationname?: string | null;
  readonly _cr664_originatedloandeal_value?: string | null;
  readonly cr664_originatedloandealname?: string | null;
}

export interface AdvisorLink {
  readonly advisorOrgId: string;
  readonly advisorName: string;
  readonly role: string;
  readonly clientOrgId: string;
  readonly clientName: string;
  readonly dealId?: string;
  readonly dealName?: string;
}

function s(v: string | null | undefined): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : '';
}

/** True when a relationship row represents an advisor link. */
export function isAdvisorRelationship(row: RelationshipRow): boolean {
  return s(row.cr664_relationshiptype).toLowerCase() === 'advisor' || isValidAdvisorRole(s(row.cr664_role));
}

/** Map advisor-tagged relationship rows to typed advisor links (source=advisor, target=client). */
export function deriveAdvisorLinks(rows: readonly RelationshipRow[]): AdvisorLink[] {
  const links: AdvisorLink[] = [];
  for (const row of rows) {
    if (!isAdvisorRelationship(row)) continue;
    const advisorOrgId = s(row._cr664_sourceorganization_value);
    const clientOrgId = s(row._cr664_targetorganization_value);
    if (advisorOrgId.length === 0 || clientOrgId.length === 0) continue; // need both parties
    const dealId = s(row._cr664_originatedloandeal_value);
    links.push({
      advisorOrgId,
      advisorName: s(row.cr664_sourceorganizationname) || 'Unnamed advisor',
      role: s(row.cr664_role) || 'Advisor',
      clientOrgId,
      clientName: s(row.cr664_targetorganizationname) || 'Unnamed client',
      ...(dealId ? { dealId, dealName: s(row.cr664_originatedloandealname) || undefined } : {}),
    });
  }
  return links;
}

/** Advisors attached to a given client (optionally scoped to a deal). */
export function advisorsForClient(links: readonly AdvisorLink[], clientOrgId: string, dealId?: string): AdvisorLink[] {
  return links.filter((l) => l.clientOrgId === clientOrgId && (dealId ? l.dealId === dealId : true));
}

/** The clients (and deals) a given advisor touches — the relationship-map payoff. */
export function clientsForAdvisor(links: readonly AdvisorLink[], advisorOrgId: string): AdvisorLink[] {
  return links.filter((l) => l.advisorOrgId === advisorOrgId);
}
