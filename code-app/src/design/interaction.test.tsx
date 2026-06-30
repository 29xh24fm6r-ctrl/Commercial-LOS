// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette, type CommandGroup } from './CommandPalette';
import { InlineEdit } from './InlineEdit';
import { ToastProvider } from './Toast';

describe('CommandPalette (⌘K)', () => {
  function groups(run: () => void): CommandGroup[] {
    return [
      { heading: 'Workspaces', items: [{ id: 'banker', label: 'Banker workspace', run }] },
    ];
  }

  it('opens on Ctrl/⌘+K and shows the search input', () => {
    render(<CommandPalette groups={groups(() => {})} />);
    expect(screen.queryByPlaceholderText(/search or run/i)).toBeNull();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText(/search or run/i)).toBeInTheDocument();
  });

  it('runs a command on select and closes', async () => {
    const run = vi.fn();
    render(<CommandPalette groups={groups(run)} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const item = await screen.findByText('Banker workspace');
    fireEvent.click(item);
    expect(run).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByPlaceholderText(/search or run/i)).toBeNull());
  });
});

describe('InlineEdit (optimistic over governed write)', () => {
  function setup(onSave: (next: string) => Promise<void>) {
    return render(
      <ToastProvider>
        <InlineEdit value="Acme Co" label="Company" onSave={onSave} />
      </ToastProvider>,
    );
  }

  it('shows the value and a click-to-edit affordance', () => {
    setup(async () => {});
    expect(screen.getByRole('button', { name: /Company: Acme Co/i })).toBeInTheDocument();
  });

  it('optimistically updates and confirms via toast on success', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    setup(onSave);
    fireEvent.click(screen.getByRole('button', { name: /Company/i }));
    const input = screen.getByLabelText('Edit Company');
    fireEvent.change(input, { target: { value: 'Cedar Holdings' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('Cedar Holdings');
    expect(await screen.findByText('Company saved')).toBeInTheDocument();
    expect(screen.getByText('Cedar Holdings')).toBeInTheDocument();
  });

  it('rolls back and shows an error toast when the governed write fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('rejected by gate'));
    setup(onSave);
    fireEvent.click(screen.getByRole('button', { name: /Company/i }));
    const input = screen.getByLabelText('Edit Company');
    fireEvent.change(input, { target: { value: 'Bad Value' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText(/Could not save company/i)).toBeInTheDocument();
    // rolled back to the original
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
    expect(screen.queryByText('Bad Value')).toBeNull();
  });

  it('does not save when disabled', () => {
    const onSave = vi.fn();
    render(
      <ToastProvider>
        <InlineEdit value="Acme Co" label="Company" disabled disabledReason="No write access" onSave={onSave} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Company/i }));
    expect(screen.queryByLabelText('Edit Company')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });
});
