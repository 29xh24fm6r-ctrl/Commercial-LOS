// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
// Env-resilience: unblock module loading of the generated Dataverse service (which pulls the
// @microsoft/power-apps SDK) without loading the real SDK. This test drives the component
// through an injected loader, never a real query. (Same idiom as CrmWriteActions.test.tsx.)
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
import { render, screen, waitFor } from '@testing-library/react';
import { TestDataView } from './TestDataView';
import type { TestDataSnapshot } from './adminTestDataQueries';

describe('TestDataView', () => {
  it('shows a loading state, then the operational/test counts and labeled rows', async () => {
    const snapshot: TestDataSnapshot = {
      operationalCount: 42,
      testRows: [
        { id: 'deal-1', name: 'SYSTEM TEST - regression fixture', createdOn: '2026-07-01T00:00:00Z', stage: 'Underwriting' },
        { id: 'deal-2', name: '[SMOKE TEST] pipeline check', createdOn: '2026-07-02T00:00:00Z', stage: 'Intake' },
      ],
    };
    const loader = vi.fn(async () => snapshot);
    render(<TestDataView loader={loader} />);

    expect(screen.getByText(/Loading deal classification/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('SYSTEM TEST - regression fixture')).toBeInTheDocument());
    expect(screen.getByText('[SMOKE TEST] pipeline check')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('TEST')).toHaveLength(2);
  });

  it('reports an honest empty state when nothing is classified as test data', async () => {
    const loader = vi.fn(async (): Promise<TestDataSnapshot> => ({ operationalCount: 10, testRows: [] }));
    render(<TestDataView loader={loader} />);
    await waitFor(() => expect(screen.getByText(/No deals match the test\/smoke naming convention/i)).toBeInTheDocument());
  });

  it('surfaces a failed load honestly instead of hiding it', async () => {
    const loader = vi.fn(async (): Promise<TestDataSnapshot> => {
      throw new Error('Dataverse read failed.');
    });
    render(<TestDataView loader={loader} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Dataverse read failed.')).toBeInTheDocument();
  });
});
