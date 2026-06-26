// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 258 — banker CRM Hub + Loan Workflow are first-class systems with
 * bank-user copy. No banker-facing "not wired", "writeback gated", "phase N",
 * or "readiness command center" language remains. Technical readiness still
 * lives in Admin.
 */

vi.mock('./workQueueQueries', () => ({ loadBankerWorkQueueData: vi.fn() }));
vi.mock('./BankerContext', () => ({
  useBanker: () => ({ bankerId: 'b1', fullName: 'Dana Banker', email: 'd@b.test', systemUserId: 's1', writeDisabledReason: undefined }),
}));

import { BankerOperatingCommandCenter } from './BankerOperatingCommandCenter';
import { CrmHubWorkspace } from '../crm/workspace/CrmHubWorkspace';
import { BankerLoanWorkflowWorkbench } from './BankerLoanWorkflowWorkbench';
import type { CrmWorkspaceData, CrmDomainKey } from '../crm/workspace/crmWorkspaceData';
import type { BankerWorkQueueData } from './workQueueQueries';

const BANNED = [
  /not wired/i,
  /not yet wired/i,
  /writeback gated/i,
  /readiness command center/i,
  /read-only command center/i,
  /source-of-truth posture/i,
  /internal relationship intelligence/i,
  /\bphase\s*\d/i,
];

function scan(node: HTMLElement) {
  const text = node.textContent ?? '';
  for (const re of BANNED) {
    expect(text, `banner-banned phrase ${re} in banker surface`).not.toMatch(re);
  }
}

function emptyCrm(): CrmWorkspaceData {
  const r = { status: 'ready' as const, records: [] };
  const keys: CrmDomainKey[] = [
    'organizations', 'people', 'relationships', 'roleAssignments', 'contactPoints',
    'communicationPreferences', 'contactAuthorizations', 'vendorProfiles', 'timelineEvents', 'auditEntries',
  ];
  return Object.fromEntries(keys.map((k) => [k, r])) as CrmWorkspaceData;
}

function emptyWorkQueue(): BankerWorkQueueData {
  return { deals: [], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] };
}

describe('Phase 258 — banker systems use bank-user copy', () => {
  it('Banker Operating Command Center has no dev/admin governance copy', () => {
    const { container } = render(<BankerOperatingCommandCenter />);
    scan(container);
  });

  it('CRM Hub workspace has no dev/readiness copy and shows the CRM system', async () => {
    const { container, findByText } = render(<CrmHubWorkspace loadData={async () => emptyCrm()} />);
    await findByText('CRM');
    scan(container);
  });

  it('Loan Workflow workbench has no dev/readiness copy and shows the workbench', async () => {
    const { container, findByText } = render(
      <MemoryRouter>
        <BankerLoanWorkflowWorkbench loadData={async () => emptyWorkQueue()} onOpenDeal={() => {}} now={new Date('2026-06-26T12:00:00Z')} />
      </MemoryRouter>,
    );
    await findByText('Loan Workflow');
    scan(container);
  });

  it('Admin still surfaces technical readiness (kept out of banker surfaces)', () => {
    const adminReadiness = readFileSync(
      resolve(__dirname, '..', 'admin', 'ogbCrmWorkflowActivationModel.ts'),
      'utf8',
    );
    // Technical readiness language is retained in Admin, not on banker surfaces.
    expect(adminReadiness).toMatch(/readiness/i);
  });
});
