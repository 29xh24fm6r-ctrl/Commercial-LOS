// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDialogDismissal } from './useDialogDismissal';

function TestDialog({
  onClose,
  disabled = false,
  closeOnOutsideClick = true,
}: {
  onClose: () => void;
  disabled?: boolean;
  closeOnOutsideClick?: boolean;
}) {
  const ref = useDialogDismissal<HTMLDivElement>({ onClose, disabled, closeOnOutsideClick });
  return (
    <div>
      <button type="button">Outside button</button>
      <div ref={ref} role="dialog" aria-label="Test dialog" data-testid="dialog">
        <button type="button">First</button>
        <input type="text" aria-label="middle input" />
        <button type="button">Last</button>
      </div>
    </div>
  );
}

describe('useDialogDismissal', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape while disabled (e.g. a save in flight)', async () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} disabled />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when clicking outside the dialog', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText('Outside button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the dialog', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText('First'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on outside click when closeOnOutsideClick is false', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} closeOnOutsideClick={false} />);
    fireEvent.mouseDown(screen.getByText('Outside button'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close on outside click while disabled', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} disabled />);
    fireEvent.mouseDown(screen.getByText('Outside button'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps focus: Tab from the last focusable element wraps to the first', () => {
    render(<TestDialog onClose={vi.fn()} />);
    const last = screen.getByText('Last');
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('First'));
  });

  it('traps focus: Shift+Tab from the first focusable element wraps to the last', () => {
    render(<TestDialog onClose={vi.fn()} />);
    const first = screen.getByText('First');
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('Last'));
  });

  it('restores focus to the previously-focused element on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog trigger';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<TestDialog onClose={vi.fn()} />);
    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
