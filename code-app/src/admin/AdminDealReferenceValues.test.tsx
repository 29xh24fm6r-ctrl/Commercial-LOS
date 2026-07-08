// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./AdminContext', () => ({ useAdmin: vi.fn() }));

const loadMock = vi.fn();
vi.mock('./dealReferenceAdminQueries', () => ({
  loadLiveDealReferenceAdminRows: (...a: unknown[]) => loadMock(...a),
}));

const writeMock = vi.fn();
vi.mock('./dealReferenceValueWrite', () => ({
  writeDealReferenceValue: (...a: unknown[]) => writeMock(...a),
  buildLiveDealReferenceWriteDeps: () => ({}),
}));

import { useAdmin } from './AdminContext';
import { AdminDealReferenceValues } from './AdminDealReferenceValues';

const useAdminMock = vi.mocked(useAdmin);

function admin(over: Partial<ReturnType<typeof useAdmin>> = {}) {
  useAdminMock.mockReturnValue({
    upn: 'admin@bank.test',
    fullName: 'Admin',
    profileName: undefined,
    entraObjectId: 'e1',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  } as ReturnType<typeof useAdmin>);
}

function readyData() {
  return {
    kind: 'ready' as const,
    data: {
      byCategory: {
        productType: [
          { id: 'pt1', name: 'Equipment', code: 'EQUIP', category: 'productType', categoryValue: 788190000, active: true, sortOrder: 10 },
        ],
        loanStructure: [],
        pricingType: [],
      },
      uncategorized: [],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadMock.mockResolvedValue(readyData());
});

describe('AdminDealReferenceValues', () => {
  it('is read-only (no write affordances) when no Dataverse identity is resolved', async () => {
    admin({ systemUserId: undefined, writeDisabledReason: 'No systemuser provisioned.' });
    render(<AdminDealReferenceValues />);
    await waitFor(() => expect(screen.getByText('Equipment')).toBeInTheDocument());
    expect(document.querySelector('[data-admin-deal-reference-readonly]')?.textContent).toMatch(/No systemuser/i);
    // No add / edit / deactivate controls exist.
    expect(document.querySelector('[data-admin-deal-reference-add]')).toBeNull();
    expect(document.querySelector('[data-admin-deal-reference-edit]')).toBeNull();
    expect(document.querySelector('[data-admin-deal-reference-deactivate]')).toBeNull();
  });

  it('adds a value through the governed write and reloads on success', async () => {
    admin();
    writeMock.mockResolvedValue({ kind: 'success', action: 'create', id: 'new-1', label: 'x', correlationId: 'c', auditId: 'a' });
    const user = userEvent.setup();
    render(<AdminDealReferenceValues />);
    await waitFor(() => expect(screen.getByText('Equipment')).toBeInTheDocument());

    const addRow = document.querySelector('[data-admin-deal-reference-addrow="productType"]') as HTMLElement;
    await user.type(within(addRow).getByLabelText('New name'), 'SBA 7(a)');
    await user.type(within(addRow).getByLabelText('New code'), 'SBA_7A');
    await user.click(document.querySelector('[data-admin-deal-reference-add="productType"]') as HTMLButtonElement);

    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(1));
    const arg = writeMock.mock.calls[0][0] as { action: { kind: string; category: string; name: string; code: string }; authorized: boolean };
    expect(arg.action).toMatchObject({ kind: 'create', category: 'productType', name: 'SBA 7(a)', code: 'SBA_7A' });
    expect(arg.authorized).toBe(true);
    // Reload after a successful write (initial load + reload = 2).
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2));
  });

  it('deactivates a value through the governed write', async () => {
    admin();
    writeMock.mockResolvedValue({ kind: 'success', action: 'deactivate', id: 'pt1', label: 'x', correlationId: 'c', auditId: 'a' });
    const user = userEvent.setup();
    render(<AdminDealReferenceValues />);
    await waitFor(() => expect(screen.getByText('Equipment')).toBeInTheDocument());

    await user.click(document.querySelector('[data-admin-deal-reference-deactivate="pt1"]') as HTMLButtonElement);
    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(1));
    expect((writeMock.mock.calls[0][0] as { action: { kind: string; id: string } }).action).toMatchObject({ kind: 'deactivate', id: 'pt1' });
  });

  it('surfaces an honest error banner when the load fails', async () => {
    admin();
    loadMock.mockResolvedValue({ kind: 'unavailable', reason: 'cr664_category not added yet' });
    render(<AdminDealReferenceValues />);
    await waitFor(() =>
      expect(document.querySelector('[data-admin-deal-reference-unavailable]')?.textContent).toMatch(/not added yet/i),
    );
  });
});
