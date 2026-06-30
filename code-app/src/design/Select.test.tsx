// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('Select', () => {
  it('renders options + an optional placeholder', () => {
    render(<Select aria-label="Pick" options={OPTIONS} placeholder="Choose one" />);
    const el = screen.getByRole('combobox', { name: 'Pick' });
    expect(el).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Choose one' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('omits the empty option when no placeholder is given', () => {
    render(<Select aria-label="Pick" options={OPTIONS} />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('fires onChange with the selected value', () => {
    const onChange = vi.fn();
    render(<Select aria-label="Pick" options={OPTIONS} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Pick' }), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalled();
  });
});
