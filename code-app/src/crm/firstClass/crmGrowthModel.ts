export const CRM_OPPORTUNITY_STAGES = [
  'Identified', 'Contacted', 'Discovery', 'Qualified', 'Structuring',
  'Application Expected', 'Converted to Deal', 'Won/Booked', 'Lost', 'Deferred',
] as const;
export type CrmOpportunityStage = (typeof CRM_OPPORTUNITY_STAGES)[number];

export interface CrmOpportunity {
  readonly id: string;
  readonly companyId: string;
  readonly primaryContactId?: string;
  readonly productNeed: string;
  readonly estimatedAmount?: number;
  readonly purpose?: string;
  readonly source?: string;
  readonly referralId?: string;
  readonly assignedBankerId: string;
  readonly stage: CrmOpportunityStage;
  readonly expectedCloseDate?: string;
  readonly policyProbability?: number;
  readonly nextAction?: string;
  readonly nextActionDueDate?: string;
  readonly competitor?: string;
  readonly linkedDealId?: string;
  readonly outcome?: string;
  readonly outcomeReason?: string;
  readonly updatedAt: string;
}

export interface CrmReferral {
  readonly id: string;
  readonly direction: 'Incoming' | 'Outgoing';
  readonly sourceContactId: string;
  readonly companyId?: string;
  readonly opportunityId?: string;
  readonly status: 'Received' | 'Accepted' | 'In progress' | 'Completed' | 'Declined';
  readonly followUpDate?: string;
  readonly outcome?: string;
}

export type OpportunityView = 'all' | 'my' | 'team' | 'stale' | 'closing' | 'referral' | 'converted' | 'lost-deferred';

export function filterOpportunities(
  opportunities: readonly CrmOpportunity[],
  view: OpportunityView,
  context: { bankerId?: string; teamBankerIds?: readonly string[]; nowIso: string },
): readonly CrmOpportunity[] {
  const now = Date.parse(context.nowIso);
  const staleCutoff = now - 30 * 86_400_000;
  const monthEnd = new Date(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1).getTime();
  return opportunities.filter((o) => {
    if (view === 'my') return o.assignedBankerId === context.bankerId;
    if (view === 'team') return context.teamBankerIds?.includes(o.assignedBankerId) ?? false;
    if (view === 'stale') return Date.parse(o.updatedAt) < staleCutoff || !o.nextAction;
    if (view === 'closing') return Boolean(o.expectedCloseDate) && Date.parse(o.expectedCloseDate!) >= now && Date.parse(o.expectedCloseDate!) < monthEnd;
    if (view === 'referral') return Boolean(o.referralId);
    if (view === 'converted') return Boolean(o.linkedDealId) || o.stage === 'Converted to Deal';
    if (view === 'lost-deferred') return o.stage === 'Lost' || o.stage === 'Deferred';
    return true;
  });
}

export type ConversionDecision =
  | { readonly kind: 'blocked'; readonly reason: string }
  | { readonly kind: 'already-converted'; readonly dealId: string }
  | { readonly kind: 'preview'; readonly opportunity: CrmOpportunity; readonly preservesProvenance: true };

/** Pure preflight. Creation is always a separate, human-confirmed governed New Deal action. */
export function previewOpportunityConversion(
  opportunity: CrmOpportunity,
  schemaVerified: boolean,
): ConversionDecision {
  if (!schemaVerified) return { kind: 'blocked', reason: 'Opportunity schema is not verified in this tenant.' };
  if (opportunity.linkedDealId) return { kind: 'already-converted', dealId: opportunity.linkedDealId };
  if (!opportunity.companyId || !opportunity.productNeed) return { kind: 'blocked', reason: 'Company and financing need are required.' };
  return { kind: 'preview', opportunity, preservesProvenance: true };
}

export const CRM_GROWTH_SCHEMA_DEPENDENCY = Object.freeze({
  verified: false,
  tables: ['cr664_crmopportunities', 'cr664_crmreferrals'] as const,
  posture: 'fail-closed' as const,
  reason: 'Not present in the verified 10-table / 147-column CRM contract.',
});
