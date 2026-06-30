// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
