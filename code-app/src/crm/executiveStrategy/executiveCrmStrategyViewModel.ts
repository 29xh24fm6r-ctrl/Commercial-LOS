/**
 * Phase 146H — Executive CRM revenue / product strategy view model.
 * Read-only. No fake revenue. No fake ROE. No pricing recommendation.
 */

export interface ExecutiveCrmStrategySectionRow {
  key: string;
  label: string;
  status: 'available' | 'not_available' | 'partial';
  description: string;
  dataAvailable: boolean;
}

export interface ExecutiveCrmStrategyViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;
  readOnly: true;
  liveWritePerformed: false;
  externalSystemChanged: false;

  sections: readonly ExecutiveCrmStrategySectionRow[];
  nextExecutiveReviewStep: string;
}

export interface ExecutiveCrmStrategyInput {
  crmCoverageByProduct: boolean;
  crmReadinessByBankerTeam: boolean;
  relationshipIntelligenceGapsAvailable: boolean;
  salesforceActivationBlockersAvailable: boolean;
  ncinoActivationBlockersAvailable: boolean;
  depositCrossSellSignalsAvailable: boolean;
  productStrategyCrmReadinessAvailable: boolean;
  revenueProductStrategyDataAvailable: boolean;
}

export function deriveExecutiveCrmStrategyViewModel(
  input: ExecutiveCrmStrategyInput,
): ExecutiveCrmStrategyViewModel {
  function row(key: string, label: string, available: boolean, description: string): ExecutiveCrmStrategySectionRow {
    return {
      key,
      label,
      status: available ? 'available' : 'not_available',
      description,
      dataAvailable: available,
    };
  }

  const sections: ExecutiveCrmStrategySectionRow[] = [
    row('crm_coverage_product', 'CRM Coverage by Product', input.crmCoverageByProduct, 'CRM coverage segmented by product type'),
    row('crm_readiness_team', 'CRM Readiness by Banker/Team', input.crmReadinessByBankerTeam, 'CRM activation readiness by banker and team'),
    row('relationship_gaps', 'Relationship Intelligence Gaps', input.relationshipIntelligenceGapsAvailable, 'Identified gaps in relationship intelligence'),
    row('sf_blockers', 'Salesforce Activation Blockers', input.salesforceActivationBlockersAvailable, 'Salesforce activation blockers requiring resolution'),
    row('nc_blockers', 'nCino Activation Blockers', input.ncinoActivationBlockersAvailable, 'nCino activation blockers requiring resolution'),
    row('deposit_crosssell', 'Deposit / Cross-Sell Signal Availability', input.depositCrossSellSignalsAvailable, 'Availability of deposit and cross-sell signals from CRM'),
    row('product_strategy', 'Product Strategy CRM Readiness', input.productStrategyCrmReadinessAvailable, 'CRM readiness for product strategy execution'),
    row('revenue_data', 'Revenue / Product Strategy Data Availability', input.revenueProductStrategyDataAvailable, 'Revenue and product strategy data availability — not calculated revenue'),
  ];

  return {
    title: 'Executive CRM Strategy',
    subtitle: 'CRM coverage, readiness, and strategy data availability — read-only',
    safetyCopy:
      'Read-only executive view. No fake revenue, ROE, or profitability. No pricing recommendation. No portfolio optimization action. Data availability is reported, not calculated.',
    readOnly: true,
    liveWritePerformed: false,
    externalSystemChanged: false,
    sections,
    nextExecutiveReviewStep: 'Review CRM coverage gaps and activation blockers before strategy alignment.',
  };
}
