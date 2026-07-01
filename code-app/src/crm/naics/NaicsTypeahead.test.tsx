// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('AC3 — a directly-entered valid code confirms the internal title', async () => {
    const { container } = render(<NaicsTypeahead onSelect={() => {}} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '722511' } });
    await waitFor(() => expect(container.querySelector('[data-naics-validated]')).not.toBeNull());
    expect(container.querySelector('[data-naics-validated]')?.textContent).toMatch(
      /722511 — Full-Service Restaurants/,
    );
  });

  it('AC4 — an unknown six-digit code shows the not-found warning (no fabricated title)', async () => {
    const { container } = render(<NaicsTypeahead onSelect={() => {}} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '999999' } });
    await waitFor(() => expect(container.querySelector('[data-naics-not-found]')).not.toBeNull());
    expect(container.querySelector('[data-naics-not-found]')?.textContent).toMatch(
      /not found in the internal reference table/i,
    );
    expect(container.querySelector('[data-naics-validated]')).toBeNull();
  });

  it('flags a short/ill-formed numeric entry as an invalid six-digit code', async () => {
    const { container } = render(<NaicsTypeahead onSelect={() => {}} loader={readyLoader} />);
    const input = screen.getByRole('combobox', { name: /Industry \(NAICS\)/i });
    fireEvent.change(input, { target: { value: '5614' } });
    await waitFor(() => expect(container.querySelector('[data-naics-bad-format]')).not.toBeNull());
  });
});
