import type { CrmDomainKey, CrmRecord, CrmWorkspaceData } from '../workspace/crmWorkspaceData';
import { findDuplicateOrganizationClusters } from '../write/crmDuplicateDetection';

export interface CrmSearchResult {
  readonly domain: CrmDomainKey;
  readonly record: CrmRecord;
  readonly score: number;
}

const SEARCHABLE: readonly CrmDomainKey[] = [
  'organizations', 'people', 'relationships', 'timelineEvents', 'roleAssignments', 'vendorProfiles',
];

function searchableText(record: CrmRecord): string {
  return [record.title, record.subtitle, record.tertiary, record.badge, ...record.detail.flatMap((d) => [d.label, d.value])]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

/** Deterministic exact-prefix-token ranking; no opaque or inferred relevance. */
export function searchCrm(data: CrmWorkspaceData, rawQuery: string, limit = 40): readonly CrmSearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];
  const tokens = query.split(/\s+/);
  const found: CrmSearchResult[] = [];
  for (const domain of SEARCHABLE) {
    const result = data[domain];
    if (result.status !== 'ready') continue;
    for (const record of result.records) {
      const title = record.title.toLocaleLowerCase();
      const haystack = searchableText(record);
      if (!tokens.every((token) => haystack.includes(token))) continue;
      const score = title === query ? 400 : title.startsWith(query) ? 300 : title.includes(query) ? 200 : 100;
      found.push({ domain, record, score });
    }
  }
  return found.sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title)).slice(0, limit);
}

export interface CrmAttentionItem {
  readonly id: string;
  readonly kind: 'missing-contact' | 'no-recent-contact';
  readonly company: CrmRecord;
  readonly evidence: string;
}

export interface CrmHomeModel {
  readonly companyCount?: number;
  readonly relationshipCount?: number;
  readonly peopleCount?: number;
  readonly recentActivityCount?: number;
  readonly attention: readonly CrmAttentionItem[];
  readonly recentActivity: readonly CrmRecord[];
  readonly partialDomains: readonly string[];
}

export function deriveCrmHome(data: CrmWorkspaceData, now = new Date()): CrmHomeModel {
  const orgs = data.organizations.status === 'ready' ? data.organizations.records : undefined;
  const people = data.people.status === 'ready' ? data.people.records : undefined;
  const relationships = data.relationships.status === 'ready' ? data.relationships.records : undefined;
  const events = data.timelineEvents.status === 'ready' ? data.timelineEvents.records : undefined;
  const cutoff = now.getTime() - 45 * 86_400_000;
  const attention: CrmAttentionItem[] = [];
  if (orgs && people) {
    for (const company of orgs) {
      if (!people.some((person) => person.organizationId === company.id)) {
        attention.push({ id: `contact-${company.id}`, kind: 'missing-contact', company, evidence: 'No linked person record is present in the loaded CRM snapshot.' });
      }
    }
  }
  if (orgs && events) {
    for (const company of orgs) {
      const latest = events.find((event) => event.organizationId === company.id && event.occurredAt);
      if (!latest || Date.parse(latest.occurredAt!) < cutoff) {
        attention.push({
          id: `activity-${company.id}`,
          kind: 'no-recent-contact',
          company,
          evidence: latest?.occurredAt
            ? `Latest recorded activity is ${new Date(latest.occurredAt).toLocaleDateString()}; threshold is 45 days.`
            : 'No dated CRM activity is linked to this company.',
        });
      }
    }
  }
  const recentActivity = (events ?? []).filter((event) => event.occurredAt && Date.parse(event.occurredAt) >= cutoff).slice(0, 12);
  return {
    companyCount: orgs?.length,
    relationshipCount: relationships?.filter((r) => r.badge !== 'Inactive').length,
    peopleCount: people?.length,
    recentActivityCount: events ? recentActivity.length : undefined,
    attention,
    recentActivity,
    partialDomains: Object.entries(data).filter(([, result]) => result.status === 'failed').map(([key]) => key),
  };
}

export function relatedToCompany(data: CrmWorkspaceData, companyId: string) {
  const ready = (key: CrmDomainKey) => data[key].status === 'ready' ? data[key].records : [];
  const companies = ready('organizations');
  const duplicateClusters = findDuplicateOrganizationClusters(companies.map((company) => ({
    organizationId: company.id,
    name: company.title,
    legalName: company.orgLegalName,
    website: company.orgWebsite,
  })));
  return {
    company: companies.find((r) => r.id === companyId),
    people: ready('people').filter((r) => r.organizationId === companyId),
    relationships: ready('relationships').filter((r) => r.organizationId === companyId),
    activities: ready('timelineEvents').filter((r) => r.organizationId === companyId),
    roles: ready('roleAssignments').filter((r) => r.organizationId === companyId),
    audits: ready('auditEntries').filter((r) => r.organizationId === companyId),
    duplicateWarning: duplicateClusters.find((cluster) => cluster.organizationIds.includes(companyId)),
  };
}

export function relatedToPerson(data: CrmWorkspaceData, personId: string) {
  const ready = (key: CrmDomainKey) => data[key].status === 'ready' ? data[key].records : [];
  const person = ready('people').find((r) => r.id === personId);
  return {
    person,
    company: person?.organizationId ? ready('organizations').find((r) => r.id === person.organizationId) : undefined,
    activities: ready('timelineEvents').filter((r) => r.personId === personId),
    contactPoints: ready('contactPoints').filter((r) => r.personId === personId),
    preferences: ready('communicationPreferences').filter((r) => r.personId === personId),
    authorizations: ready('contactAuthorizations').filter((r) => r.personId === personId),
  };
}
