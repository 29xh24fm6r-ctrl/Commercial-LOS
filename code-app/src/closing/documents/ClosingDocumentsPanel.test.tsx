// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClosingDocumentsPanel } from './ClosingDocumentsPanel';
import type { ClosingDocumentFactModel, GeneratedClosingDocumentManifest } from './closingDocumentTypes';

const FULL_FACTS: ClosingDocumentFactModel = {
  dealId: 'deal-1',
  dealName: 'Acme Expansion',
  borrowerLegalName: 'Acme Holdings LLC',
  product: 'Term Loan',
  loanAmount: 500_000,
  closingDate: '2026-08-01',
  conditionsPrecedentResolved: true,
  fundingInstructions: 'Wire to operating account',
};

function manifest(over: Partial<GeneratedClosingDocumentManifest> = {}): GeneratedClosingDocumentManifest {
  return {
    manifestId: 'm-1',
    templateKey: 'closing_checklist',
    templateVersion: '1.0.0',
    dealId: 'deal-1',
    generatedAtIso: '2026-07-01T00:00:00.000Z',
    generatedByActorEmail: 'banker@bank.test',
    contentHash: 'abcd1234',
    correlationId: 'corr-1',
    status: 'final',
    ...over,
  };
}

describe('ClosingDocumentsPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders all 5 pilot templates and reports honest completeness when facts are incomplete', () => {
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={{}} manifests={[]} authorized onGenerate={vi.fn()} />,
    );
    expect(screen.getByText('No closing documents generated yet.')).toBeInTheDocument();
    expect(screen.getAllByText(/^Missing:/)).toHaveLength(5);
  });

  it('shows eligible templates as eligible and enables Generate only when authorized', async () => {
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={FULL_FACTS} manifests={[]} authorized={false} onGenerate={vi.fn()} />,
    );
    const row = screen.getByTestId('closing-documents-completeness').closest('div')!;
    const checklistRow = within(row.parentElement as HTMLElement).getByText('Closing Checklist').closest('li')!;
    expect(within(checklistRow).getByText('Eligible.')).toBeInTheDocument();
    expect(within(checklistRow).getByRole('button', { name: /Generate/ })).toBeDisabled();
  });

  it('generates on click when eligible and authorized, invoking onGenerate with the right template', async () => {
    const onGenerate = vi.fn(async (_template: { key: string }) => ({
      kind: 'generated' as const,
      manifest: manifest(),
      renderedContent: 'x',
      auditRecorded: true,
    }));
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={FULL_FACTS} manifests={[]} authorized onGenerate={onGenerate} />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    const user = userEvent.setup();
    await user.click(within(checklistRow).getByRole('button', { name: /Generate/ }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0]![0].key).toBe('closing_checklist');
  });

  it('shows a generated document\'s attribution and offers Regenerate instead of Generate once one exists', () => {
    render(
      <ClosingDocumentsPanel
        dealId="deal-1"
        facts={FULL_FACTS}
        manifests={[manifest()]}
        authorized
        onGenerate={vi.fn()}
      />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    expect(within(checklistRow).getByText(/Generated 2026-07-01T00:00:00.000Z by banker@bank.test/)).toBeInTheDocument();
    expect(within(checklistRow).getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('flags superseded versions distinctly from the current one', () => {
    const older = manifest({ manifestId: 'm-1' });
    const newer = manifest({ manifestId: 'm-2', supersedesManifestId: 'm-1' });
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={FULL_FACTS} manifests={[older, newer]} authorized onGenerate={vi.fn()} />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    expect(within(checklistRow).getByText(/1 superseded version\(s\) on record\./)).toBeInTheDocument();
  });

  it('toggles a preview showing only the facts actually supplied, never a fabricated field', async () => {
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={FULL_FACTS} manifests={[]} authorized onGenerate={vi.fn()} />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    const user = userEvent.setup();
    await user.click(within(checklistRow).getByRole('button', { name: 'Preview' }));
    expect(within(checklistRow).getByText(/Acme Expansion/)).toBeInTheDocument();
    await user.click(within(checklistRow).getByRole('button', { name: 'Hide preview' }));
    expect(within(checklistRow).queryByText(/Acme Expansion/)).toBeNull();
  });

  it('disables Preview for an ineligible template', () => {
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={{}} manifests={[]} authorized onGenerate={vi.fn()} />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    expect(within(checklistRow).getByRole('button', { name: 'Preview' })).toBeDisabled();
  });

  it('surfaces a generation write-failure as an alert', async () => {
    const onGenerate = vi.fn(async () => ({ kind: 'write_failed' as const, error: 'Dataverse rejected', correlationId: 'c1' }));
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={FULL_FACTS} manifests={[]} authorized onGenerate={onGenerate} />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    const user = userEvent.setup();
    await user.click(within(checklistRow).getByRole('button', { name: /Generate/ }));
    expect(await within(checklistRow).findByRole('alert')).toHaveTextContent('Generation failed: Dataverse rejected');
  });

  /**
   * Factory mission PR C — regression coverage for the closing-document content-readback fix.
   * Before onGetContent existed, a previously-persisted manifest (loaded via listManifestsForDeal,
   * i.e. NOT this session's own generation call) had no "Download" affordance at all — the button
   * only ever appeared for a document just generated in the current session.
   */
  it('offers a Download button for a previously-generated manifest, and retrieves its content via onGetContent', async () => {
    // jsdom does not implement the Blob-URL APIs the actual file-download step uses; stub them so
    // the click-through completes without touching real browser download machinery.
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const onGetContent = vi.fn(async () => ({ success: true, content: 'the persisted document text' }));
    render(
      <ClosingDocumentsPanel
        dealId="deal-1"
        facts={FULL_FACTS}
        manifests={[manifest()]}
        authorized
        onGenerate={vi.fn()}
        onGetContent={onGetContent}
      />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    const downloadButton = within(checklistRow).getByRole('button', { name: 'Download' });
    const user = userEvent.setup();
    await user.click(downloadButton);
    expect(onGetContent).toHaveBeenCalledWith('m-1');
  });

  it('does not offer a Download button for a previously-generated manifest when onGetContent is not supplied', () => {
    render(
      <ClosingDocumentsPanel dealId="deal-1" facts={FULL_FACTS} manifests={[manifest()]} authorized onGenerate={vi.fn()} />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    expect(within(checklistRow).queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('surfaces an honest retrieval error rather than silently doing nothing when onGetContent fails', async () => {
    const onGetContent = vi.fn(async () => ({ success: false, error: 'Manifest has no recorded content.' }));
    render(
      <ClosingDocumentsPanel
        dealId="deal-1"
        facts={FULL_FACTS}
        manifests={[manifest()]}
        authorized
        onGenerate={vi.fn()}
        onGetContent={onGetContent}
      />,
    );
    const checklistRow = screen.getByText('Closing Checklist').closest('li')!;
    const user = userEvent.setup();
    await user.click(within(checklistRow).getByRole('button', { name: 'Download' }));
    expect(await within(checklistRow).findByRole('alert')).toHaveTextContent('Manifest has no recorded content.');
  });
});
