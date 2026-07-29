export const CRM_SECTIONS = [
  'home',
  'companies',
  'people',
  'relationships',
  'opportunities',
  'activities',
  'referrals',
  'calendar',
  'tasks',
  'insights',
  'reports',
] as const;

export type CrmSection = (typeof CRM_SECTIONS)[number];
