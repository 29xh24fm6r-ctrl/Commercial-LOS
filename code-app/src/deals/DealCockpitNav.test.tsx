// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DealCockpitNav } from './DealCockpitNav';

/**
 * Remediation 2026-07-22 (Workstream C) — pins the fix for "Back returns to the same deal": a
 * plain `<a href="#…">` inside a BrowserRouter pushes a new history entry for the same URL on
 * every click. DealCockpitNav must scroll to the target section directly instead, so clicking
 * several anchors and then pressing Back doesn't just walk backward through duplicate entries for
 * this same page.
 */

const targets: HTMLElement[] = [];
afterEach(() => {
  for (const el of targets.splice(0)) el.remove();
  vi.clearAllMocks();
});

function mountTarget(id: string): ReturnType<typeof vi.fn> {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  targets.push(el);
  const scroll = vi.fn();
  el.scrollIntoView = scroll;
  return scroll;
}

describe('DealCockpitNav', () => {
  it('scrolls to the target section instead of letting the browser navigate the hash', async () => {
    const scroll = mountTarget('stage-map');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    render(
      <MemoryRouter>
        <DealCockpitNav />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByText('Stage Map'));

    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    // No new history entry for this click -- the hash-navigation default was prevented.
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it('does not throw when the target section is not present in the DOM', async () => {
    render(
      <MemoryRouter>
        <DealCockpitNav />
      </MemoryRouter>,
    );
    await expect(userEvent.click(screen.getByText('Activity'))).resolves.not.toThrow();
  });

  it('every anchor still carries a real href for accessibility/right-click-open-in-new-tab', () => {
    render(
      <MemoryRouter>
        <DealCockpitNav />
      </MemoryRouter>,
    );
    expect(screen.getByText('Stage Map').closest('a')).toHaveAttribute('href', '#stage-map');
  });
});
