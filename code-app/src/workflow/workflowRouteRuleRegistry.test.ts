import { describe, it, expect } from 'vitest';
import { WORKFLOW_ROUTE_RULE_REGISTRY } from './workflowRouteRuleRegistry';

/**
 * Phase 142C — route rule registry pins.
 */

const VALID_OPERATORS = new Set([
  'equals', 'not_equals', 'in', 'not_in', 'greater_than', 'greater_than_or_equal',
  'less_than', 'less_than_or_equal', 'exists', 'missing', 'truthy', 'falsy',
]);

describe('Phase 142C — route rule registry', () => {
  it('includes all required route rules', () => {
    const routeKeys = new Set(WORKFLOW_ROUTE_RULE_REGISTRY.map((r) => r.routeKey));
    for (const k of [
      'small_business_standard', 'sba_7a_standard', 'commercial_real_estate', 'construction_or_project_based',
      'working_capital_line', 'annual_review_standard', 'annual_review_with_covenant_exception',
      'annual_review_missing_financials', 'annual_review_package_review', 'portfolio_boarded_loan_review',
      'exception_remediation', 'credit_committee_required', 'executive_visibility_required', 'fdic_examiner_package_required',
    ]) {
      expect(routeKeys.has(k)).toBe(true);
    }
  });

  it('every rule has a priority, routeKey, and static conditions only', () => {
    for (const r of WORKFLOW_ROUTE_RULE_REGISTRY) {
      expect(typeof r.priority).toBe('number');
      expect(r.routeKey.length).toBeGreaterThan(0);
      for (const c of r.conditions) {
        expect(typeof c.field).toBe('string');
        expect(VALID_OPERATORS.has(c.operator)).toBe(true);
      }
    }
  });

  it('contains no eval / function / SQL / OData query conditions', () => {
    const serialized = JSON.stringify(WORKFLOW_ROUTE_RULE_REGISTRY);
    expect(serialized).not.toMatch(/\beval\b|function\s*\(|=>|\bselect\b|\$filter|\bwhere\b/i);
  });

  it('the credit committee route has a committee policy but no approval action', () => {
    const cc = WORKFLOW_ROUTE_RULE_REGISTRY.find((r) => r.routeKey === 'credit_committee_required')!;
    expect(cc.committeePolicy).toBe('credit_committee');
    expect(JSON.stringify(cc)).not.toMatch(/\bapprove\b|approval_action|recordVote/i);
  });

  it('no route rule can approve credit', () => {
    expect(JSON.stringify(WORKFLOW_ROUTE_RULE_REGISTRY)).not.toMatch(/approveCredit|finalApproval:\s*true|autoApprove/i);
  });
});
