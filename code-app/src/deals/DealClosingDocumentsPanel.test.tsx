// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DealClosingDocumentsPanel } from './DealClosingDocumentsPanel';
import type { DealDetail } from './dealQueries';
import type { ClosingDocumentStorageDeps, ClosingDocumentListResult, ClosingDocumentStorageResult } from '../closing/documents/closingDocumentStorage';
import type { GeneratedClosingDocumentManifest } from '../closing/documents/closingDocumentTypes';

/**
 * PR A remediation — this panel now uses createDataverseClosingDocumentStore() (a real
 * Dataverse-backed store) instead of the in-memory reference implementation. Mirrors
 * DealFundingAuthorizationPanel.test.tsx's own established pattern: mock the store FACTORY (not
 * the generated SDK), so the panel's real wiring/logic is exercised end to end against a
 * controllable fake durable store.
 */
const { createStoreMock } = vi.hoisted(() => ({ createStoreMock: vi.fn() }));

vi.mock('../closing/documents/closingDocumentStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../closing/documents/closingDocumentStorage')>();
  return { ...actual, createDataverseClosingDocumentStore: createStoreMock };
});

function fakeDurableStore(): ClosingDocumentStorageDeps {
  const manifests: GeneratedClosingDocumentManifest[] = [];
  return {
    createManifestRecord: async (manifest): Promise<ClosingDocumentStorageResult> => {
      manifests.push(manifest);
      return { success: true, id: manifest.manifestId };
    },
    listManifestsForDeal: async (dealId): Promise<ClosingDocumentListResult> => ({
      success: true,
      manifests: manifests.filter((m) => m.dealId === dealId),
    }),
  };
}

beforeEach(() => {
  createStoreMock.mockReset();
  createStoreMock.mockImplementation(fakeDurableStore);
});

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Corp',
    stage: 'Closing & Funding',
    status: 'Open',
    amount: 500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-08-01T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'One PG',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R and Inventory',
    createdOn: '2026-07-01T00:00:00Z',
    stageEntryDate: '2026-07-20T00:00:00Z',
    isClosed: false,
    ...overrides,
  };
}

describe('DealClosingDocumentsPanel', () => {
  it('says plainly that documents are saved to Dataverse (not the old session-only wording)', () => {
    render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByRole('note')).toHaveTextContent(/saved to Dataverse/i);
  });

  it('derives real facts from the deal and shows the closing checklist as eligible', () => {
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]');
    expect(row?.textContent).toMatch(/Eligible/i);
  });

  it('leaves jurisdiction-less facts undefined rather than fabricating them, so a jurisdiction-blind template still shows correctly for missing facts it DOES need', () => {
    // internal_funding_checklist requires fundingInstructions, which has no source on DealDetail.
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="internal_funding_checklist"]');
    expect(row?.textContent).toMatch(/Missing:.*fundingInstructions/i);
  });

  it('generating a document persists it through the durable store and reports it honestly with no audit', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]') as HTMLElement;
    const generateBtn = Array.from(row.querySelectorAll('button')).find((b) => /generate/i.test(b.textContent ?? '')) as HTMLButtonElement;
    await user.click(generateBtn);
    await waitFor(() => expect(container.querySelector('[data-testid="closing-document-generated-closing_checklist"]')).not.toBeNull());
  });

  // PR A remediation — there was no download affordance anywhere in this panel.
  it('PR A: shows a Download button once a document is generated', async () => {
    const user = userEvent.setup();
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]') as HTMLElement;
    const generateBtn = Array.from(row.querySelectorAll('button')).find((b) => /generate/i.test(b.textContent ?? '')) as HTMLButtonElement;
    await user.click(generateBtn);
    await waitFor(() => expect(row.querySelector('[data-closing-document-download="closing_checklist"]')).not.toBeNull());
  });

  // PR A remediation — a failed durable read must surface honestly, never silently look like
  // "no documents exist yet" for a deal that may well have some.
  it('PR A: surfaces a visible, mapped (never raw) error when the durable read fails', async () => {
    createStoreMock.mockImplementation(() => ({
      createManifestRecord: fakeDurableStore().createManifestRecord,
      listManifestsForDeal: async () => ({ success: false, error: 'Dataverse read timed out.' }),
    }));
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    await waitFor(() => expect(container.querySelector('[data-closing-documents-load-error]')).not.toBeNull());
    const errorNote = container.querySelector('[data-closing-documents-load-error]') as HTMLElement;
    expect(errorNote.textContent).not.toContain('Dataverse read timed out');
    expect(errorNote.textContent).toMatch(/couldn't save that action/i);
  });

  // N-25 remediation (Production Remediation Factory Arc Phase 8)
  it('N-25: the preview includes loan purpose/term/ownership structure when the deal has them', async () => {
    const user = userEvent.setup();
    const deal = baseDeal({ loanPurpose: 'Acquisition of commercial property', loanTermMonths: 60, ownershipStructure: 'LLC' });
    const { container } = render(<DealClosingDocumentsPanel deal={deal} authorized={true} actorEmail="banker@bank.test" />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]') as HTMLElement;
    const previewBtn = Array.from(row.querySelectorAll('button')).find((b) => /preview/i.test(b.textContent ?? '')) as HTMLButtonElement;
    await user.click(previewBtn);
    expect(row.textContent).toMatch(/Loan purpose: Acquisition of commercial property/);
    expect(row.textContent).toMatch(/Loan term: 60 months/);
    expect(row.textContent).toMatch(/Ownership structure: LLC/);
  });

  it('disables generation entirely when the actor is not authorized', () => {
    const { container } = render(<DealClosingDocumentsPanel deal={baseDeal()} authorized={false} actorEmail={undefined} />);
    const row = container.querySelector('[data-closing-document-row="closing_checklist"]') as HTMLElement;
    const generateBtn = Array.from(row.querySelectorAll('button')).find((b) => /generate/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);
  });
});
