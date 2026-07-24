// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('./DealDataProvider', () => ({ useDealData: vi.fn() }));

import { useDealData } from './DealDataProvider';
import { DealServicingLifecyclePanel } from './DealServicingLifecyclePanel';
import type { ServicingLifecycleLoadResult } from './loadServicingLifecycleSnapshotForLoan';
import { deriveServicingLifecycleStage } from '../servicing/deriveServicingLifecycleStage';
import { deriveServicingCollateralSecurityStatus } from '../servicing/deriveServicingCollateralSecurityStatus';
import { deriveServicingInsuranceTicklerStatus } from '../servicing/deriveServicingInsuranceTicklerStatus';
import { deriveServicingCovenantReportingStatus } from '../servicing/deriveServicingCovenantReportingStatus';
import { deriveServicingMaturityRenewalStatus } from '../servicing/deriveServicingMaturityRenewalStatus';
import { deriveServicingLifecycleSnapshot } from '../servicing/deriveServicingLifecycleSnapshot';
import type { ServicingLifecycleInput } from '../servicing/servicingLifecycleTypes';

const mock = vi.mocked(useDealData);

function setup(stage: string | undefined) {
  mock.mockReturnValue({
    deal: { id: 'deal-1', name: 'Deal', stage, clientName: 'Acme Corp', effectiveClientName: undefined },
  } as unknown as ReturnType<typeof useDealData>);
}

const AS_OF = '2026-07-24';

function healthySnapshot() {
  const input: ServicingLifecycleInput = { lifecycleId: 'svc-loan-1', asOfDate: AS_OF, boardedLoan: { verified: true } };
  const stage = deriveServicingLifecycleStage(input);
  const { insuranceStatus, ticklerStatus } = deriveServicingInsuranceTicklerStatus({
    insurance: { accepted: true, evidencePresent: true, expirationDate: '2027-01-01' },
    ticklers: [],
    asOfDate: AS_OF,
  });
  return deriveServicingLifecycleSnapshot({
    input, stage, obligations: [],
    collateralSecurityStatus: deriveServicingCollateralSecurityStatus({ collateralItems: [{ collateralId: 'CL1', hasEvidence: true, perfected: true }] }),
    insuranceStatus, ticklerStatus,
    covenantReportingStatus: deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'pass' }] }),
    maturityRenewalStatus: deriveServicingMaturityRenewalStatus({ maturityDate: '2030-01-01', asOfDate: AS_OF }),
  });
}

describe('DealServicingLifecyclePanel — live, read-only mount', () => {
  it('a pre-boarding deal renders nothing and never calls the live loader', () => {
    setup('Underwriting');
    const loadSnapshot = vi.fn();
    const { container } = render(<DealServicingLifecyclePanel loadSnapshot={loadSnapshot} />);
    expect(container).toBeEmptyDOMElement();
    expect(loadSnapshot).not.toHaveBeenCalled();
  });

  it('a boarded deal fetches and renders the real snapshot', async () => {
    setup('Boarded / Servicing');
    const snapshot = healthySnapshot();
    const result: ServicingLifecycleLoadResult = { kind: 'loaded', snapshot };
    const loadSnapshot = vi.fn(async () => result);
    render(<DealServicingLifecyclePanel loadSnapshot={loadSnapshot} />);
    expect(screen.getByText(/loading real servicing evidence/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Servicing lifecycle')).toBeInTheDocument());
    expect(loadSnapshot).toHaveBeenCalledWith('deal-1', 'Boarded / Servicing', { borrowerName: 'Acme Corp' });
  });

  it('a claimed-boarded deal with no real handoff record renders nothing (never fabricates a snapshot)', async () => {
    setup('Boarded / Servicing');
    const result: ServicingLifecycleLoadResult = { kind: 'not_boarded' };
    const loadSnapshot = vi.fn(async () => result);
    const { container } = render(<DealServicingLifecyclePanel loadSnapshot={loadSnapshot} />);
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[data-servicing-lifecycle-unavailable]')).toBeNull());
    expect(screen.queryByText('Servicing lifecycle')).toBeNull();
  });

  it('a failed live read discloses the failure rather than showing a false-healthy panel', async () => {
    setup('Boarded / Servicing');
    const result: ServicingLifecycleLoadResult = { kind: 'unavailable', message: 'Portfolio boarded-loan read failed: boom (fail-closed).' };
    const loadSnapshot = vi.fn(async () => result);
    render(<DealServicingLifecyclePanel loadSnapshot={loadSnapshot} />);
    await waitFor(() => expect(screen.getByText(/fail-closed/i)).toBeInTheDocument());
  });
});
