import { describe, it, expect } from 'vitest';
import { deriveServicingCollateralSecurityStatus } from './deriveServicingCollateralSecurityStatus';

/**
 * Phase 142E — collateral / security status pins.
 */

describe('Phase 142E — collateral / security status', () => {
  it('complete when evidence-backed perfected collateral exists', () => {
    const r = deriveServicingCollateralSecurityStatus({ collateralItems: [{ collateralId: 'CL1', type: 'real_estate', perfected: true, hasEvidence: true }] });
    expect(r.status).toBe('complete');
  });

  it('missing_evidence when collateral docs are missing', () => {
    const r = deriveServicingCollateralSecurityStatus({ collateralItems: [{ collateralId: 'CL1', hasEvidence: false }] });
    expect(r.status).toBe('missing_evidence');
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('exception_active when collateral is not perfected', () => {
    const r = deriveServicingCollateralSecurityStatus({ collateralItems: [{ collateralId: 'CL1', hasEvidence: true, perfected: false }] });
    expect(r.status).toBe('exception_active');
  });

  it('unknown when collateral context is absent', () => {
    expect(deriveServicingCollateralSecurityStatus({}).status).toBe('unknown_missing_data');
  });

  it('values no collateral and computes no LTV', () => {
    const r = deriveServicingCollateralSecurityStatus({ collateralItems: [{ collateralId: 'CL1', hasEvidence: true, perfected: true }] });
    expect(JSON.stringify(r)).not.toMatch(/ltv|appraisedValue|"value":|\$\s*\d/i);
  });
});
