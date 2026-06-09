/**
 * Phase 142A — Governed view registry (constants only).
 *
 * Salesforce/Twenty-style "views" as STATIC governed metadata. No user-created
 * views, no SQL/OData query strings from the UI, no direct fetch, and no route
 * changes. Filters are structured (never raw query strings).
 */

export type PlatformViewWorkspace = 'banker' | 'team' | 'manager' | 'executive' | 'admin';

export type PlatformViewRiskClass = 'runtime_read';

export interface PlatformViewFilter {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'is_true' | 'is_false' | 'is_set' | 'is_missing';
  value?: string | number | boolean | readonly string[];
}

export interface PlatformViewDefinition {
  viewKey: string;
  objectKey: string;
  displayName: string;
  workspace: PlatformViewWorkspace;
  filters: readonly PlatformViewFilter[];
  sort: readonly { field: string; direction: 'asc' | 'desc' }[];
  columns: readonly string[];
  emptyState: string;
  riskClass: PlatformViewRiskClass;
  requiresPermission: string;
  /** The existing read-only deriver that backs this view (no new fetch). */
  sourceDeriver: string;
  route?: string;
}

function view(v: PlatformViewDefinition): PlatformViewDefinition {
  return v;
}

export const PLATFORM_VIEW_REGISTRY: readonly PlatformViewDefinition[] = Object.freeze([
  view({ viewKey: 'banker_active_deals', objectKey: 'deal', displayName: 'Banker active deals', workspace: 'banker', filters: [{ field: 'status', operator: 'neq', value: 'closed' }], sort: [{ field: 'updatedAt', direction: 'desc' }], columns: ['dealName', 'status', 'stage'], emptyState: 'No active deals.', riskClass: 'runtime_read', requiresPermission: 'banker:deal', sourceDeriver: 'deriveBankerWorkQueue' }),
  view({ viewKey: 'banker_annual_reviews_due', objectKey: 'annual_review', displayName: 'Banker annual reviews due', workspace: 'banker', filters: [{ field: 'annualReviewDueStatus', operator: 'in', value: ['due', 'past_due'] }], sort: [{ field: 'reviewDueDate', direction: 'asc' }], columns: ['borrowerName', 'reviewDueDate', 'status'], emptyState: 'No annual reviews due.', riskClass: 'runtime_read', requiresPermission: 'banker:annual_review', sourceDeriver: 'deriveAnnualReviewCommandCenterModel' }),
  view({ viewKey: 'manager_exception_queue', objectKey: 'exception', displayName: 'Manager exception queue', workspace: 'manager', filters: [{ field: 'status', operator: 'eq', value: 'open' }], sort: [{ field: 'severity', direction: 'desc' }], columns: ['exceptionId', 'severity', 'owner'], emptyState: 'No open exceptions.', riskClass: 'runtime_read', requiresPermission: 'manager:exceptions', sourceDeriver: 'deriveExceptionTape' }),
  view({ viewKey: 'portfolio_annual_review_pipeline', objectKey: 'annual_review', displayName: 'Portfolio annual review pipeline', workspace: 'manager', filters: [], sort: [{ field: 'reviewDueDate', direction: 'asc' }], columns: ['borrowerName', 'status', 'soundness'], emptyState: 'No annual reviews in the pipeline.', riskClass: 'runtime_read', requiresPermission: 'manager:portfolio', sourceDeriver: 'deriveAnnualReviewCommandCenterModel' }),
  view({ viewKey: 'crm_authorized_financial_request_contacts', objectKey: 'crm_person', displayName: 'CRM authorized financial request contacts', workspace: 'banker', filters: [{ field: 'authorizedForFinancialRequests', operator: 'is_true' }], sort: [{ field: 'fullName', direction: 'asc' }], columns: ['fullName', 'orgId'], emptyState: 'No authorized financial request contacts.', riskClass: 'runtime_read', requiresPermission: 'banker:crm', sourceDeriver: 'deriveCrmContactReadiness' }),
  view({ viewKey: 'crm_missing_authorization_contacts', objectKey: 'crm_person', displayName: 'CRM missing authorization contacts', workspace: 'banker', filters: [{ field: 'authorizedForFinancialRequests', operator: 'is_false' }], sort: [{ field: 'fullName', direction: 'asc' }], columns: ['fullName', 'orgId'], emptyState: 'No contacts missing authorization.', riskClass: 'runtime_read', requiresPermission: 'banker:crm', sourceDeriver: 'deriveCrmContactTasks' }),
  view({ viewKey: 'annual_review_missing_financials', objectKey: 'financial_spread_snapshot', displayName: 'Annual review missing financials', workspace: 'banker', filters: [{ field: 'status', operator: 'eq', value: 'unknown' }], sort: [], columns: ['annualReviewId', 'status'], emptyState: 'No annual reviews missing financials.', riskClass: 'runtime_read', requiresPermission: 'banker:annual_review', sourceDeriver: 'deriveAnnualReviewFinancialReadiness' }),
  view({ viewKey: 'annual_review_covenant_exceptions', objectKey: 'covenant_test_result', displayName: 'Annual review covenant exceptions', workspace: 'banker', filters: [{ field: 'status', operator: 'in', value: ['fail', 'review_required'] }], sort: [], columns: ['covenantId', 'status'], emptyState: 'No covenant exceptions.', riskClass: 'runtime_read', requiresPermission: 'banker:annual_review', sourceDeriver: 'testAnnualReviewCovenants' }),
  view({ viewKey: 'fdic_package_readiness', objectKey: 'fdic_package', displayName: 'FDIC package readiness', workspace: 'manager', filters: [], sort: [], columns: ['annualReviewId', 'status'], emptyState: 'No FDIC packages.', riskClass: 'runtime_read', requiresPermission: 'manager:annual_review', sourceDeriver: 'deriveAnnualReviewPackageReadiness' }),
  view({ viewKey: 'board_package_readiness', objectKey: 'board_package', displayName: 'Board package readiness', workspace: 'manager', filters: [], sort: [], columns: ['annualReviewId', 'status'], emptyState: 'No board packages.', riskClass: 'runtime_read', requiresPermission: 'manager:annual_review', sourceDeriver: 'deriveAnnualReviewPackageReadiness' }),
  view({ viewKey: 'delivery_blocked_do_not_contact', objectKey: 'delivery_adapter_state', displayName: 'Delivery blocked by do-not-contact', workspace: 'banker', filters: [{ field: 'blockerCode', operator: 'eq', value: 'delivery_do_not_contact' }], sort: [], columns: ['channel', 'blockerCode'], emptyState: 'No deliveries blocked by do-not-contact.', riskClass: 'runtime_read', requiresPermission: 'banker:annual_review', sourceDeriver: 'validateAnnualReviewDeliveryRequest' }),
  view({ viewKey: 'delivery_blocked_missing_authorization', objectKey: 'delivery_adapter_state', displayName: 'Delivery blocked by missing authorization', workspace: 'banker', filters: [{ field: 'blockerCode', operator: 'eq', value: 'delivery_recipient_not_authorized' }], sort: [], columns: ['channel', 'blockerCode'], emptyState: 'No deliveries blocked by missing authorization.', riskClass: 'runtime_read', requiresPermission: 'banker:annual_review', sourceDeriver: 'validateAnnualReviewDeliveryRequest' }),
]);

export const ALL_PLATFORM_VIEW_KEYS: readonly string[] = Object.freeze(
  PLATFORM_VIEW_REGISTRY.map((v) => v.viewKey),
);
