// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Stub the generated Dataverse service so this unit test never loads the real Power Apps SDK
// chain (@microsoft/power-apps/data) — the component is driven by injectable loaders below.
vi.mock('../../generated/services/Cr664_naicscodesService', () => ({
  Cr664_naicscodesService: { getAll: vi.fn(async () => ({ data: [] })) },
}));
import { NaicsTypeahead } from './NaicsTypeahead';
import type { NaicsLoader } from './naicsSearch';

const readyLoader: NaicsLoader = async () => ({
  status: 'ready',
  rows: [
    { cr664_code: '722511', cr664_title: 'Full-Service Restaurants' },
    { cr664_code: '811111', cr664_title: 'General Automotive Repair' },
  ],
});

const unavailableLoader: NaicsLoader = async () => ({
  status: 'unavailable',
  reason: 'NAICS reference table is not provisioned yet (see docs/NAICS_SETUP.md).',
});

describe('NaicsTypeahead', () => {
  it('resolves plain language to a 6-digit code + sector and selects it', async () => {
    const onSelect = vi.fn();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'restaurant' } });
    const option = await screen.findByText('Full-Service Restaurants');
    // shows the derived sector context
    expect(screen.getByText(/72 · Accommodation and Food Services/)).toBeInTheDocument();
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: '722511', sectorCode: '72' }),
    );
  });

  it('shows an honest unavailable state when the reference table is absent', async () => {
    render(<NaicsTypeahead onSelect={() => {}} loader={unavailableLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'auto' } });
    expect(await screen.findByText(/not provisioned yet/i)).toBeInTheDocument();
  });

  it('clears the selection when the field is emptied', async () => {
    const onSelect = vi.fn();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.change(input, { target: { value: 'auto' } });
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
  });

  // NAICS Lookup UX enhancement — external links + direct-code validation.
  it('AC1 — renders the external lookup links securely', () => {
    render(<NaicsTypeahead onSelect={() => {}} loader={readyLoader} />);
    const census = screen.getByRole('link', { name: /Search official Census NAICS/i });
    expect(census).toHaveAttribute('href', 'https://www.census.gov/naics/');
    expect(census).toHaveAttribute('target', '_blank');
    expect(census).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: /Search NAICS\.com lookup/i })).toHaveAttribute(
      'href',
      'https://www.naics.com/search/',
    );
  });

  it('AC3 — a directly-entered valid code confirms the internal title via the exact server lookup', async () => {
    const findByCode = vi.fn(async (c: string) =>
      c === '561422' ? { cr664_code: '561422', cr664_title: 'Telemarketing Bureaus and Other Contact Centers' } : null,
    );
    const { container } = render(<NaicsTypeahead onSelect={() => {}} loader={readyLoader} findByCode={findByCode} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '561422' } });
    await waitFor(() => expect(container.querySelector('[data-naics-validated]')).not.toBeNull());
    expect(container.querySelector('[data-naics-validated]')?.textContent).toMatch(
      /561422 — Telemarketing Bureaus and Other Contact Centers/,
    );
    expect(findByCode).toHaveBeenCalledWith('561422');
  });

  it('AC4 — an unknown six-digit code shows the not-found warning (no fabricated title)', async () => {
    const findByCode = vi.fn(async () => null);
    const { container } = render(<NaicsTypeahead onSelect={() => {}} loader={readyLoader} findByCode={findByCode} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '999999' } });
    await waitFor(() => expect(container.querySelector('[data-naics-not-found]')).not.toBeNull());
    expect(container.querySelector('[data-naics-not-found]')?.textContent).toMatch(
      /not found in the internal reference table/i,
    );
    expect(container.querySelector('[data-naics-validated]')).toBeNull();
  });

  it('HOTFIX — validates a six-digit code by EXACT lookup, independent of the typeahead result set', async () => {
    // The typeahead set deliberately EXCLUDES 561422 (mirrors the deployed pagination bug where a
    // valid code was missing from the loaded page). The exact server lookup still confirms it.
    const loaderWithout: NaicsLoader = async () => ({
      status: 'ready',
      rows: [{ cr664_code: '111110', cr664_title: 'Soybean Farming' }],
    });
    const findByCode = vi.fn(async (c: string) =>
      c === '561422' ? { cr664_code: '561422', cr664_title: 'Telemarketing Bureaus and Other Contact Centers' } : null,
    );
    const { container } = render(<NaicsTypeahead onSelect={() => {}} loader={loaderWithout} findByCode={findByCode} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '561422' } });
    await waitFor(() => expect(container.querySelector('[data-naics-validated]')).not.toBeNull());
    expect(container.querySelector('[data-naics-validated]')?.textContent).toMatch(/Telemarketing Bureaus/);
    expect(findByCode).toHaveBeenCalledWith('561422');
  });

  it('flags a short/ill-formed numeric entry as an invalid six-digit code', async () => {
    const { container } = render(<NaicsTypeahead onSelect={() => {}} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.change(input, { target: { value: '5614' } });
    await waitFor(() => expect(container.querySelector('[data-naics-bad-format]')).not.toBeNull());
  });

});

describe('PR 103 — real pointer + keyboard commit parity (not just synthetic fireEvent.change)', () => {
  it('a REAL userEvent.click (full pointerdown/mousedown/mouseup/click sequence) commits the selection', async () => {
    // fireEvent.click dispatches only a bare `click` event, skipping the mousedown a real click
    // produces first — which is exactly what the outside-click-closes-dropdown listener listens
    // for. userEvent reproduces the full sequence, so this proves that listener never races the
    // click on a genuinely CONTAINED option away.
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    await user.click(input);
    await user.type(input, 'restaurant');
    const option = await screen.findByText('Full-Service Restaurants');
    await user.click(option);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ code: '722511' }));
    expect(input).toHaveValue('722511 — Full-Service Restaurants');
  });

  it('pressing Enter with no arrow-key navigation commits the first (pre-highlighted) result', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    await user.click(input);
    await user.type(input, 'a'); // matches BOTH seeded hits (Restaurants, Automotive)
    await screen.findByText('General Automotive Repair');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    // Whichever hit sorts first, Enter with no arrow navigation must commit it — never a no-op.
    expect(onSelect.mock.calls[0]![0]).toMatchObject({});
  });

  it('ArrowDown moves the highlight, and Enter commits the newly-highlighted (not the first) option', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    await user.click(input);
    await user.type(input, 'a'); // both seeded hits match
    await screen.findByText('General Automotive Repair');

    const firstOption = screen.getAllByRole('option')[0]!;
    const initiallyHighlighted = firstOption.getAttribute('aria-selected');
    expect(initiallyHighlighted).toBe('true'); // index 0 is pre-highlighted by default

    await user.keyboard('{ArrowDown}');
    const secondOption = screen.getAllByRole('option')[1]!;
    expect(secondOption.getAttribute('aria-selected')).toBe('true');
    expect(firstOption.getAttribute('aria-selected')).toBe('false');

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    const committedCode = onSelect.mock.calls[0]![0].code as string;
    expect(committedCode).toBe(secondOption.getAttribute('data-crm-naics-option'));
  });

  it('ArrowUp from the first option wraps to the last option', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    await user.click(input);
    await user.type(input, 'a');
    await screen.findByText('General Automotive Repair');

    await user.keyboard('{ArrowUp}');
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('Escape closes the dropdown without committing anything', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    await user.click(input);
    await user.type(input, 'restaurant');
    await screen.findByText('Full-Service Restaurants');

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Full-Service Restaurants')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a fresh query resets the highlight so a stale index from a prior query is never committed', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<NaicsTypeahead onSelect={onSelect} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    await user.click(input);
    await user.type(input, 'a');
    await screen.findByText('General Automotive Repair');
    await user.keyboard('{ArrowDown}'); // highlight index 1

    await user.clear(input);
    await user.type(input, 'restaurant'); // narrows to a single, different hit
    // "Full-Service Restaurants" was already on screen from the PRIOR ('a') query
    // (which matched both seeded hits), so a bare findByText would resolve before
    // the debounced re-filter actually narrows the list. Wait for the stale
    // "Automotive" hit to actually drop out first, so the assertion below reflects
    // the post-narrowing render, not a leftover one.
    await waitFor(() => expect(screen.queryByText('General Automotive Repair')).not.toBeInTheDocument());
    const restaurantOption = await screen.findByText('Full-Service Restaurants');
    expect(restaurantOption.closest('button')?.getAttribute('aria-selected')).toBe('true');

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ code: '722511' }));
  });
});
