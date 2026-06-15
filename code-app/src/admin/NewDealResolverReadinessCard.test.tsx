// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * Phase 170H -- Admin New Deal resolver readiness card (read-only smoke).
 */

vi.mock('../deals/newDealReferenceReader', () => ({
  resolveConfiguredNewDealReferences: vi.fn(),
}));

import { resolveConfiguredNewDealReferences } from '../deals/newDealReferenceReader';
import { NewDealResolverReadinessCard } from './NewDealResolverReadinessCard';

const resolveMock = vi.mocked(resolveConfiguredNewDealReferences);

beforeEach(() => {
  resolveMock.mockReset();
});

describe('Phase 170H -- readiness card states', () => {
  it('renders the loading state before resolution settles', () => {
    let resolveFn: (v: never) => void = () => {};
    resolveMock.mockReturnValue(new Promise((res) => { resolveFn = res as never; }));
    const { container } = render(<NewDealResolverReadinessCard />);
    expect(container.querySelector('[data-admin-resolver-status="loading"]')).not.toBeNull();
    void resolveFn;
  });

  it('renders the ready state with Stage/Status code+name, TEST warning, and create-disabled note', async () => {
    resolveMock.mockResolvedValue({
      kind: 'ready',
      stageId: 's1',
      statusId: 't1',
      stageBind: '/cr664_dealstagereferences(s1)',
      statusBind: '/cr664_dealstatusreferences(t1)',
    });
    const { container } = render(<NewDealResolverReadinessCard />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-resolver-status="ready"]')).not.toBeNull();
    });
    expect(screen.getByText(/PHASE121_STAGE/)).toBeInTheDocument();
    expect(screen.getByText(/PHASE121_STATUS/)).toBeInTheDocument();
    expect(
      container.querySelector('[data-admin-resolver-test-warning]')?.textContent,
    ).toMatch(/TEST reference rows — not production-approved/i);
    expect(
      container.querySelector('[data-admin-resolver-create-note]')?.textContent,
    ).toMatch(/Create remains disabled/i);
  });

  it('does NOT display a record GUID in the ready state', async () => {
    resolveMock.mockResolvedValue({
      kind: 'ready',
      stageId: '128de457-3059-f111-bec7-70a8a59be491',
      statusId: '8029c312-3159-f111-bec7-70a8a59be491',
      stageBind: '/cr664_dealstagereferences(128de457-3059-f111-bec7-70a8a59be491)',
      statusBind: '/cr664_dealstatusreferences(8029c312-3159-f111-bec7-70a8a59be491)',
    });
    const { container } = render(<NewDealResolverReadinessCard />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-resolver-status="ready"]')).not.toBeNull();
    });
    expect(container.textContent ?? '').not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });

  const blockedCases: Array<[string, { kind: string;[k: string]: unknown }]> = [
    ['notConfigured', { kind: 'notConfigured', reason: 'not registered yet' }],
    ['missingStage', { kind: 'missingStage' }],
    ['missingStatus', { kind: 'missingStatus' }],
    ['duplicateStage', { kind: 'duplicateStage', count: 2 }],
    ['duplicateStatus', { kind: 'duplicateStatus', count: 2 }],
    ['inactiveStage', { kind: 'inactiveStage' }],
    ['inactiveStatus', { kind: 'inactiveStatus' }],
    ['serviceError', { kind: 'serviceError', message: 'boom' }],
  ];
  for (const [label, result] of blockedCases) {
    it(`renders fail-closed blocked state for ${label}`, async () => {
      resolveMock.mockResolvedValue(result as never);
      const { container } = render(<NewDealResolverReadinessCard />);
      await waitFor(() => {
        expect(container.querySelector(`[data-admin-resolver-status="${label}"]`)).not.toBeNull();
      });
      expect(container.querySelector(`[data-admin-resolver-status="${label}"]`)?.textContent).toMatch(/Blocked \(fail-closed\)/i);
      // Never a ready state, never a create control.
      expect(container.querySelector('[data-admin-resolver-status="ready"]')).toBeNull();
      expect(container.querySelectorAll('button').length).toBe(0);
    });
  }

  it('fails closed when the resolver call rejects', async () => {
    resolveMock.mockRejectedValue(new Error('network down'));
    const { container } = render(<NewDealResolverReadinessCard />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-resolver-status="serviceError"]')).not.toBeNull();
    });
  });

  it('renders no enabled create button in any state', async () => {
    resolveMock.mockResolvedValue({ kind: 'notConfigured', reason: 'x' } as never);
    const { container } = render(<NewDealResolverReadinessCard />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-resolver-status="notConfigured"]')).not.toBeNull();
    });
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});

describe('Phase 170H -- readiness card source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'NewDealResolverReadinessCard.tsx'), 'utf8');

  it('introduces no fetch / XHR / Graph and no write/create', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });

  it('hardcodes no inspected record GUID', () => {
    for (const id of ['128de457-3059-f111-bec7-70a8a59be491', '8029c312-3159-f111-bec7-70a8a59be491']) {
      expect(SRC).not.toContain(id);
    }
  });
});
