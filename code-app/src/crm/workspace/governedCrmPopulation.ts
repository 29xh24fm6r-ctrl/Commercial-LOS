import type {
  CrmDomainKey,
  CrmDomainResult,
  CrmWorkspaceData,
} from './crmWorkspaceData';
import { isTestOrSmokeDealName } from '../../shared/deals/testDealClassification';

/**
 * Apply the same controlled-record naming contract used by the LOS population to CRM companies,
 * then cascade the exclusion through already-loaded related records. Nothing is deleted and the
 * original data remains available to authorized Admin/data-quality tooling.
 */
export function governedOperationalCrmPopulation(
  data: CrmWorkspaceData,
): CrmWorkspaceData {
  if (data.organizations.status !== 'ready') return data;

  const excludedOrganizationIds = new Set(
    data.organizations.records
      .filter((record) => isTestOrSmokeDealName(record.title))
      .map((record) => record.id),
  );
  if (excludedOrganizationIds.size === 0) return data;

  const includedOrganizations = data.organizations.records.filter(
    (record) => !excludedOrganizationIds.has(record.id),
  );
  const excludedPersonIds = new Set(
    data.people.records
      .filter(
        (record) =>
          record.organizationId !== undefined &&
          excludedOrganizationIds.has(record.organizationId),
      )
      .map((record) => record.id),
  );

  const filterDomain = (
    key: CrmDomainKey,
    result: CrmDomainResult,
  ): CrmDomainResult => {
    if (result.status !== 'ready') return result;
    if (key === 'organizations') {
      return { ...result, records: includedOrganizations };
    }
    return {
      ...result,
      records: result.records.filter(
        (record) =>
          !(
            record.organizationId !== undefined &&
            excludedOrganizationIds.has(record.organizationId)
          ) &&
          !(
            record.personId !== undefined &&
            excludedPersonIds.has(record.personId)
          ),
      ),
    };
  };

  return Object.fromEntries(
    Object.entries(data).map(([key, result]) => [
      key,
      filterDomain(key as CrmDomainKey, result),
    ]),
  ) as CrmWorkspaceData;
}
