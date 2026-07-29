import type { CrmWorkspaceData } from '../workspace/crmWorkspaceData';
import { deriveCrmHome } from './crmWorkspaceSelectors';
export type CrmOperatingRole = 'banker'|'manager'|'team'|'portfolio'|'executive';
export function deriveCrmRoleView(data:CrmWorkspaceData,role:CrmOperatingRole){
  const home=deriveCrmHome(data);
  return {
    role,
    aggregateOnly:role==='executive',
    coverageGapCount:home.attention.length,
    companyCount:home.companyCount,
    activityCount:home.recentActivityCount,
    scopeLabel:role==='executive'?'Aggregate authorized CRM result set':'Current authorized CRM result set',
    unavailable:['Opportunity pipeline','Conversion','Banker workload','Product penetration'],
  } as const;
}
export function canOpenCrmRecord(role:CrmOperatingRole):boolean{return role!=='executive'}
