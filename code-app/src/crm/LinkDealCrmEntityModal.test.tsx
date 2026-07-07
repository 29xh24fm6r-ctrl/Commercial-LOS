// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkDealCrmEntityModal } from './LinkDealCrmEntityModal';
import type { CrmLinkOption } from './dealCrmLinkOptions';
import type { LinkDealCrmEntityOutcome } from './write/linkDealCrmEntity';

/**
 * Scalable Link CRM client modal.
 *
 * Pins: no full list by default, >= 2-char search, deal-name suggestions,
 * capped + grouped results, "more matches" hint, and preserved link/bridge
 * wiring (the modal returns the selected option; the parent links/bridges).
 */

const linkOk: LinkDealCrmEntityOutcome = {
  kind: 'success',
  dealId: 'd1',
  target: 'client',
  entityId: 'x',
  entityName: 'x',
  correlationId: 'c',
  auditId: 'a',
};

function client(name: string): CrmLinkOption {
  return { id: `c-${name}`, name, active: true, sourceKind: 'clientrelationship' };
}
function org(name: string): CrmLinkOption {
  return {
    id: `o-${name}`,
    name,
    active: true,
    sourceKind: 'organization',
    sublabel: 'CRM Company — will create/link borrower client record',
  };
}

function renderModal(opts: {
  options: CrmLinkOption[];
  dealName?: string;
  onLink?: (o: CrmLinkOption) => Promise<LinkDealCrmEntityOutcome>;
  onLinked?: (o: CrmLinkOption, out: LinkDealCrmEntityOutcome) => void;
}) {
  const onLink = opts.onLink ?? vi.fn(async () => linkOk);
  const onLinked = opts.onLinked ?? vi.fn();
  const onClose = vi.fn();
  render(
    <LinkDealCrmEntityModal
      targetKind="client"
      dealName={opts.dealName}
      loadOptions={async () => opts.options}
      onLink={onLink}
      onLinked={onLinked}
      onClose={onClose}
    />,
  );
  return { onLink, onLinked, onClose };
}

const search = () => document.querySelector('[data-link-crm-search]') as HTMLInputElement;

beforeEach(() => vi.clearAllMocks());

describe('LinkDealCrmEntityModal — scalable results', () => {
  it('does not render every CRM record on an empty search', async () => {
    const options = Array.from({ length: 30 }, (_, i) => client(`Company ${i}`));
    renderModal({ options, dealName: 'Unrelated Deal Name' });
    // Once loaded, it shows the type-to-search hint, not 30 options.
    await waitFor(() => expect(document.querySelector('[data-link-crm-hint]')).not.toBeNull());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('shows a deal-name suggestion by default (no typing)', async () => {
    renderModal({
      options: [client('Acme Holdings LLC'), client('Beta Foods Inc')],
      dealName: 'Acme Term Loan',
    });
    // Acme (shares the deal's leading token) is suggested; Beta is not.
    expect(await screen.findByRole('option', { name: /Acme Holdings LLC/i })).toBeInTheDocument();
    expect(document.querySelector('[data-link-crm-suggestions]')).not.toBeNull();
    expect(screen.queryByRole('option', { name: /Beta Foods Inc/i })).toBeNull();
  });

  it('runs a general search only at 2+ characters, capped, with a "more matches" hint', async () => {
    const options = Array.from({ length: 30 }, (_, i) => client(`Acme ${String(i).padStart(2, '0')}`));
    renderModal({ options, dealName: '' });
    const user = userEvent.setup();

    // 1 char: still the prompt, no results.
    await user.type(search(), 'a');
    await waitFor(() => expect(document.querySelector('[data-link-crm-hint]')).not.toBeNull());
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    // 2+ chars: capped filtered results + the refine hint.
    await user.type(search(), 'cme');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(20));
    expect(document.querySelector('[data-link-crm-more]')?.textContent).toMatch(
      /More matches exist\. Refine your search\./i,
    );
  });

  it('ranks exact matches above contains matches', async () => {
    renderModal({ options: [client('Beta Acme Corp'), client('Acme')], dealName: '' });
    const user = userEvent.setup();
    await user.type(search(), 'Acme');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(2));
    const optionNames = screen.getAllByRole('option').map((o) => o.textContent);
    expect(optionNames[0]).toMatch(/^Acme$/);
    expect(optionNames[1]).toMatch(/Beta Acme Corp/);
  });

  it('groups client + CRM company results under clear headings', async () => {
    renderModal({ options: [client('Acme Holdings'), org('Acme Robotics')], dealName: '' });
    const user = userEvent.setup();
    await user.type(search(), 'Acme');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(2));
    const titles = Array.from(document.querySelectorAll('[data-link-crm-group-title]')).map((n) => n.textContent);
    expect(titles).toEqual(['Existing CRM Client', 'CRM Company — will create/link borrower client record']);
    // The company option is tagged for the bridge path.
    const orgOption = screen.getByRole('option', { name: /Acme Robotics/i });
    expect(orgOption.getAttribute('data-link-crm-option-kind')).toBe('organization');
  });

  it('preserves keyboard access and existing link wiring: options are buttons and confirm links', async () => {
    const onLink = vi.fn(async (_o: CrmLinkOption) => linkOk);
    const onLinked = vi.fn();
    renderModal({ options: [client('Acme Holdings')], dealName: '', onLink, onLinked });
    const user = userEvent.setup();
    await user.type(search(), 'Acme');
    const option = await screen.findByRole('option', { name: /Acme Holdings/i });
    expect(option.tagName).toBe('BUTTON'); // natively keyboard-activatable
    await user.click(option);
    await user.click(screen.getByRole('button', { name: /^Link client$/i }));
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onLink.mock.calls[0][0]).toMatchObject({ id: 'c-Acme Holdings' });
    expect(onLinked).toHaveBeenCalledTimes(1);
  });
});
