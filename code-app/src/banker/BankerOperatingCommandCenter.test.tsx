// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BankerOperatingCommandCenter } from './BankerOperatingCommandCenter';

describe('Phase 232 — Banker Operating Command Center', () => {
  it('renders a unified CRM + LOS banker operating cockpit', () => {
    render(<BankerOperatingCommandCenter />);

    expect(
      screen.getByRole('region', { name: /Banker Operating Command Center/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('CRM + LOS active')).toBeInTheDocument();
    expect(screen.getByText(/Unified CRM \+ LOS workflow cockpit/i)).toBeInTheDocument();
  });

  it('shows all major banker operating domains', () => {
    render(<BankerOperatingCommandCenter />);
    const region = screen.getByRole('region', { name: /Banker Operating Command Center/i });

    for (const label of [
      'CRM relationship intelligence',
      'Loan workflow cockpit',
      'Daily banker action queue',
      'New Deal intake',
      'Document checklist readiness',
      'Borrower communications',
      'CRM records',
      'Portfolio boarding handoff',
    ]) {
      expect(within(region).getByText(label)).toBeInTheDocument();
    }
  });

  it('points bankers to existing deal cockpit anchors', () => {
    render(<BankerOperatingCommandCenter />);
    const anchors = screen.getByRole('region', { name: /Deal cockpit anchors/i });

    for (const anchor of [
      'stage-map',
      'workstreams',
      'crm-relationship',
      'credit-memo',
      'tasks',
      'documents',
    ]) {
      expect(within(anchors).getByText(anchor)).toBeInTheDocument();
    }
  });

  // Completion Phase C — banker dashboard label honesty: a gated live-write domain must never
  // render the word "enabled". The flag is the FIRST gate; the banker layer cannot see the
  // authority's certification/evidence, so it presents "gated" (off) or "armed — pending
  // certification" (on), never a bare "enabled". "enabled" is reserved for the live pilot.
  describe('Completion Phase C — live-write card label honesty', () => {
    function card(container: HTMLElement, id: string): HTMLElement {
      const el = container.querySelector<HTMLElement>(`[data-operating-domain="${id}"]`);
      expect(el, `card ${id}`).not.toBeNull();
      return el!;
    }

    it.each([
      ['borrower-communications', 'Send gated'],
      ['document-readiness', 'Generation gated'],
      ['portfolio-handoff', 'Boarding persistence gated'],
    ])('%s reads gated and never "enabled" at the safe default', (id, gatedLabel) => {
      const { container } = render(<BankerOperatingCommandCenter />);
      const el = card(container, id);
      const value = el.querySelector('[data-domain-value]');
      expect(value?.textContent).toBe(gatedLabel);
      expect(value?.textContent).not.toMatch(/\benabled\b/i); // value never over-asserts
      expect(within(el).getByText('gated')).toBeInTheDocument(); // status badge
    });

    it('New Deal intake here reflects the global create gate (gated); the live pilot is its own surface', () => {
      const { container } = render(<BankerOperatingCommandCenter />);
      // This command-center card reads BANKER_NEW_DEAL_CREATE_ENABLED (a global gate that stays
      // false). The genuinely-live banker create pilot is rendered by BankerNewDealCreate, not here.
      const value = card(container, 'new-deal').querySelector('[data-domain-value]');
      expect(value?.textContent).toBe('Create gated');
      expect(value?.textContent).not.toMatch(/\benabled\b/i);
    });
  });

  it('renders no action controls and introduces no write primitive', () => {
    render(<BankerOperatingCommandCenter />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const src = readFileSync(resolve(__dirname, 'BankerOperatingCommandCenter.tsx'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest/);
    expect(src).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
  });
});