// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServicingLifecyclePanel } from './ServicingLifecyclePanel';
import { deriveServicingLifecycleSnapshot } from './deriveServicingLifecycleSnapshot';
import { deriveServicingLifecycleStage } from './deriveServicingLifecycleStage';
import { deriveServicingCollateralSecurityStatus } from './deriveServicingCollateralSecurityStatus';
import { deriveServicingInsuranceTicklerStatus } from './deriveServicingInsuranceTicklerStatus';
import { deriveServicingCovenantReportingStatus } from './deriveServicingCovenantReportingStatus';
import { deriveServicingMaturityRenewalStatus } from './deriveServicingMaturityRenewalStatus';
import type { ServicingLifecycleSnapshot } from './servicingLifecycleTypes';

const AS_OF = '2026-06-09';

function snapshot(overrides: Parameters<typeof deriveServicingCollateralSecurityStatus>[0] = { collateralItems: [{ collateralId: 'CL1', hasEvidence: true, perfected: true }] }): ServicingLifecycleSnapshot {
  const input = { lifecycleId: 'L1', asOfDate: AS_OF, boardedLoan: { verified: true } } as const;
  const { insuranceStatus, ticklerStatus } = deriveServicingInsuranceTicklerStatus({ insurance: { accepted: true, evidencePresent: true, expirationDate: '2027-01-01' }, ticklers: [], asOfDate: AS_OF });
  return deriveServicingLifecycleSnapshot({
    input, stage: deriveServicingLifecycleStage(input), obligations: [],
    collateralSecurityStatus: deriveServicingCollateralSecurityStatus(overrides),
    insuranceStatus, ticklerStatus,
    covenantReportingStatus: deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'pass' }] }),
    maturityRenewalStatus: deriveServicingMaturityRenewalStatus({ maturityDate: '2030-01-01', asOfDate: AS_OF }),
  });
}

describe('Phase 142E — ServicingLifecyclePanel', () => {
  it('renders the read-only banner and lifecycle rows', () => {
    render(<ServicingLifecyclePanel snapshot={snapshot()} />);
    expect(screen.getByText(/Read-only servicing decision support/i)).toBeTruthy();
    expect(screen.getByText('Stage')).toBeTruthy();
    expect(screen.getByText('Health')).toBeTruthy();
    expect(screen.getByText('Collateral')).toBeTruthy();
  });

  it('surfaces blockers when collateral evidence is missing', () => {
    render(<ServicingLifecyclePanel snapshot={snapshot({ collateralItems: [{ collateralId: 'CL1', hasEvidence: false }] })} />);
    expect(screen.getByText('Blockers')).toBeTruthy();
  });

  it('exposes no mutation controls (no buttons)', () => {
    const { container } = render(<ServicingLifecyclePanel snapshot={snapshot()} />);
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
