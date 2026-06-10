import { describe, it, expect } from 'vitest';
import { deriveCrmRelationshipDrillThroughTargets } from './crmRelationshipIntelligenceDrillthrough';

describe('Phase 146C — crmRelationshipIntelligenceDrillthrough', () => {
  it('creates drill-through targets for a complete input', () => {
    const targets = deriveCrmRelationshipDrillThroughTargets({
      relationshipName: 'Acme Corp',
      salesforceAccountLabel: 'SF-Acme',
      salesforceOpportunityLabel: 'SF-Opp-1',
      ncinoRelationshipLabel: 'NC-Acme',
      ncinoLoanLabel: 'NC-Loan-1',
      matchConfidence: 'strong_match',
      conflicts: ['Name mismatch'],
      contacts: ['John Contact'],
      activitySignals: ['Recent call'],
      documentSignals: [],
      crossSellSignals: ['Deposit opportunity'],
      nextSafeAction: 'Review match',
    });

    expect(targets.length).toBeGreaterThanOrEqual(5);
    expect(targets.every((t) => t.readOnly === true)).toBe(true);
  });

  it('marks unavailable when no Salesforce references', () => {
    const targets = deriveCrmRelationshipDrillThroughTargets({
      relationshipName: 'Test',
      salesforceAccountLabel: undefined,
      salesforceOpportunityLabel: undefined,
      ncinoRelationshipLabel: undefined,
      ncinoLoanLabel: undefined,
      matchConfidence: undefined,
      conflicts: [],
      contacts: [],
      activitySignals: [],
      documentSignals: [],
      crossSellSignals: [],
      nextSafeAction: undefined,
    });

    const sfTarget = targets.find((t) => t.title === 'Salesforce References');
    expect(sfTarget?.unavailableReason).toContain('No Salesforce');
  });

  it('all targets are read-only', () => {
    const targets = deriveCrmRelationshipDrillThroughTargets({
      relationshipName: 'Test',
      salesforceAccountLabel: undefined,
      salesforceOpportunityLabel: undefined,
      ncinoRelationshipLabel: undefined,
      ncinoLoanLabel: undefined,
      matchConfidence: undefined,
      conflicts: [],
      contacts: [],
      activitySignals: [],
      documentSignals: [],
      crossSellSignals: [],
      nextSafeAction: undefined,
    });
    for (const t of targets) {
      expect(t.readOnly).toBe(true);
    }
  });
});
