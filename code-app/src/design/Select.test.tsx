// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';

// Options where the stored value (a code) deliberately DIFFERS from the visible label, so a
// value/label mix-up would be caught (e.g. storing 'Beta' instead of 'b').
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

  it('P2-13: onChange delivers the option VALUE (code), never the visible label', () => {
    const onChange = vi.fn();
    render(<Select aria-label="Pick" options={OPTIONS} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Pick' }), { target: { value: 'b' } });
    const evt = onChange.mock.calls[0][0] as { target: HTMLSelectElement };
    expect(evt.target.value).toBe('b'); // the code
    expect(evt.target.value).not.toBe('Beta'); // never the label
  });

  it('P2-13: keyboard-accessible selection persists the value AND the visible label matches it', async () => {
    // A controlled harness: what the user SEES (selected option text) and what is STORED must agree.
    function Harness() {
      const [value, setValue] = useState('');
      const selected = OPTIONS.find((o) => o.value === value);
      return (
        <>
          <Select
            aria-label="Pick"
            options={OPTIONS}
            placeholder="Choose one"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <output data-stored>{value}</output>
          <output data-shown>{selected?.label ?? ''}</output>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const combo = screen.getByRole('combobox', { name: 'Pick' }) as HTMLSelectElement;
    // The control is keyboard-reachable (native <select> exposes the combobox role + is focusable).
    combo.focus();
    expect(combo).toHaveFocus();
    // selectOptions drives the same accessible selection path keyboard/AT users use.
    await user.selectOptions(combo, 'Beta');
    // Stored value is the code; the visible selected label is 'Beta' — they correspond, no divergence.
    expect(document.querySelector('[data-stored]')?.textContent).toBe('b');
    expect(document.querySelector('[data-shown]')?.textContent).toBe('Beta');
    expect(combo.value).toBe('b');
    // The rendered selected <option> the user sees is the Beta option.
    expect(combo.selectedOptions[0]?.textContent).toBe('Beta');
  });
});
