import type { CrmSpineEntityKey } from '../crmSalesforceSpineModel';

/**
 * CRM-E — canonical CRM seed / backfill readiness + unresolved-link exception reporting.
 *
 * PURE and READ-ONLY. It NEVER fabricates a record and NEVER writes: it takes MEASURED
 * facts (how many canonical cr664_crm* records exist, and how each deal's client stub
 * resolves to a canonical organization) and reports:
 *   - which canonical sections actually hold records (data-driven "seeded"),
 *   - unresolved-link EXCEPTIONS (a deal names a client but no canonical org resolves),
 *   - whether the governed operator backfill path is ready and the graph is exception-free.
 *
 * It also projects the measured facts into the `loadedEntities` the spine launch-readiness
 * engine consumes, so the deal CRM context stops saying "contacts/roles/activities not
 * seeded" once real records exist — driven by evidence, not a hardcoded phase literal.
 *
 * The committed default facts are EMPTY (no records, no deals): honest "not seeded yet",
 * zero fabricated records, and — with no deals needing a client — exception-free.
 */

export type CrmCanonicalSection = 'organizations' | 'persons' | 'relationships' | 'roles' | 'activities';

export const CRM_CANONICAL_SECTIONS: readonly CrmCanonicalSection[] = [
  'organizations',
  'persons',
  'relationships',
  'roles',
  'activities',
];

/** A deal's client-stub → canonical-organization resolution fact (measured, never invented). */
export interface CrmDealClientLink {
  readonly dealId: string;
  /** The client/borrower stub name on the deal, or null when the deal has no client. */
  readonly clientName: string | null;
  /** The resolved canonical cr664_crmorganization id, or null when unresolved. */
  readonly resolvedOrganizationId: string | null;
}

export interface CrmCanonicalSeedFacts {
  /** Measured present record counts per canonical section (never fabricated). */
  readonly counts: Readonly<Record<CrmCanonicalSection, number>>;
  /** Per-deal client-stub resolution facts. */
  readonly dealClientLinks: readonly CrmDealClientLink[];
}

/** A deal whose client stub cannot resolve to a canonical organization — needs backfill/seed. */
export interface CrmUnresolvedLink {
  readonly dealId: string;
  readonly clientName: string;
  readonly reason: string;
}

/** One governed, operator-safe backfill step. Additive + non-destructive; never fabricates. */
export interface CrmBackfillStep {
  readonly section: CrmCanonicalSection;
  readonly action: string;
}

/**
 * The prepared operator-safe backfill plan. Every step is additive and derives records from
 * EXISTING authorized data (e.g. migrate the cr664_clientrelationship stub into a canonical
 * cr664_crmorganization); nothing here invents a client, contact, or relationship.
 */
export const CRM_CANONICAL_BACKFILL_PLAN: readonly CrmBackfillStep[] = Object.freeze([
  { section: 'organizations', action: 'Migrate each cr664_clientrelationship borrower/client stub into a canonical cr664_crmorganization (name required; never invented).' },
  { section: 'persons', action: 'Seed cr664_crmperson + cr664_crmcontactpoint from authorized contact data per organization.' },
  { section: 'relationships', action: 'Create cr664_crmrelationship edges (deal↔organization, organization↔person) from existing authorized links.' },
  { section: 'roles', action: 'Seed cr664_crmroleassignment from authorized coverage/role facts.' },
  { section: 'activities', action: 'Capture cr664_crmtimelineevent activity going forward via the identity-gated hub; historical backfill optional.' },
]);

export interface CrmCanonicalSeedReadiness {
  /** Per-section: true when at least one canonical record is measured present. */
  readonly sectionsSeeded: Readonly<Record<CrmCanonicalSection, boolean>>;
  /** True when any canonical section holds records. */
  readonly seededRecordsPresent: boolean;
  /** Deals naming a client that does not resolve to a canonical organization. */
  readonly exceptions: readonly CrmUnresolvedLink[];
  /** True when there are no unresolved links. */
  readonly exceptionFree: boolean;
  /** The governed operator backfill path is wired (plan + exception model present). */
  readonly backfillPathReady: boolean;
  /** Ready = the backfill path is governed AND the graph is exception-free. */
  readonly ready: boolean;
  /** Spine entities to mark loaded (data-driven), fed to the spine launch-readiness engine. */
  readonly loadedEntities: Partial<Record<CrmSpineEntityKey, boolean>>;
  readonly blockers: readonly string[];
  readonly backfillPlan: readonly CrmBackfillStep[];
}

/** Committed default: no canonical records seeded yet, no deals — honest + exception-free. */
export const CURRENT_CRM_CANONICAL_SEED_FACTS: CrmCanonicalSeedFacts = Object.freeze({
  counts: Object.freeze({ organizations: 0, persons: 0, relationships: 0, roles: 0, activities: 0 }),
  dealClientLinks: Object.freeze([]),
});

export function deriveCrmCanonicalSeedReadiness(
  facts: CrmCanonicalSeedFacts = CURRENT_CRM_CANONICAL_SEED_FACTS,
): CrmCanonicalSeedReadiness {
  const sectionsSeeded = CRM_CANONICAL_SECTIONS.reduce(
    (acc, s) => {
      acc[s] = (facts.counts[s] ?? 0) > 0;
      return acc;
    },
    {} as Record<CrmCanonicalSection, boolean>,
  );
  const seededRecordsPresent = CRM_CANONICAL_SECTIONS.some((s) => sectionsSeeded[s]);

  // Unresolved-link exceptions: a deal names a client but no canonical org resolves.
  const exceptions: CrmUnresolvedLink[] = facts.dealClientLinks
    .filter((l) => (l.clientName ?? '').trim().length > 0 && !l.resolvedOrganizationId)
    .map((l) => ({
      dealId: l.dealId,
      clientName: (l.clientName ?? '').trim(),
      reason: 'Deal names a client with no resolved canonical cr664_crmorganization; backfill/seed required.',
    }));
  const exceptionFree = exceptions.length === 0;

  // Data-driven spine loaded flags: only mark loaded where records actually exist.
  const loadedEntities: Partial<Record<CrmSpineEntityKey, boolean>> = {};
  if (sectionsSeeded.organizations) loadedEntities.account = true;
  if (sectionsSeeded.persons) loadedEntities.contact = true;
  if (sectionsSeeded.relationships) loadedEntities.accountContactRelationship = true;
  if (sectionsSeeded.roles) loadedEntities.relationshipRole = true;
  if (sectionsSeeded.activities) loadedEntities.activity = true;

  const backfillPathReady = true;
  const blockers: string[] = [];
  if (!exceptionFree) {
    blockers.push(`${exceptions.length} deal(s) name a client with no canonical CRM organization — backfill required.`);
  }
  const ready = backfillPathReady && exceptionFree;

  return {
    sectionsSeeded,
    seededRecordsPresent,
    exceptions,
    exceptionFree,
    backfillPathReady,
    ready,
    loadedEntities,
    blockers,
    backfillPlan: CRM_CANONICAL_BACKFILL_PLAN,
  };
}

/**
 * Project measured seed facts into the spine launch-readiness `loadedEntities` input.
 * Passing this into deriveCrmSalesforceSpineLaunchReadiness flips seeded sections from
 * "seed-required" to "renderable" — the deal CRM context stops claiming "not seeded"
 * once real records exist.
 */
export function crmSeededLoadedEntities(
  facts: CrmCanonicalSeedFacts = CURRENT_CRM_CANONICAL_SEED_FACTS,
): Partial<Record<CrmSpineEntityKey, boolean>> {
  return deriveCrmCanonicalSeedReadiness(facts).loadedEntities;
}
