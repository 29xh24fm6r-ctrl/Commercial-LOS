// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BankerCrmIntelligencePanel } from './BankerCrmIntelligencePanel';
import { BankerOperatingCommandCenter } from './BankerOperatingCommandCenter';

/**
 * Phase 257 — launch acceptance: banker surfaces carry no developer/internal
 * copy. This is the "no visible 'not yet wired', 'phase', or 'writeback gated'"
 * acceptance criterion, scanned across the real (non-mocked) banker dashboard
 * relationship + operating surfaces.
 */

const BANNED = [
  /not yet wired/i,
  /writeback gated/i,
  /source-of-truth posture/i,
  /internal relationship intelligence/i,
  /not yet available/i,
  // The specific dev phrase "read-only detail — no write" (a bare "Read-only"
  // badge is acceptable bank-user copy).
  /read-only detail[\s\S]{0,12}no write/i,
  // Phase references in user-facing copy (e.g. "Phase 169B").
  /\bphase\s*\d/i,
];

function scan(node: HTMLElement) {
  const text = node.textContent ?? '';
  for (const re of BANNED) {
    expect(text, `banner-banned phrase ${re} appeared in banker copy`).not.toMatch(re);
  }
}

describe('Phase 257 — banker surfaces use bank-user copy only', () => {
  it('CRM Command Center / relationship intelligence has no dev/internal copy', () => {
    const { container } = render(
      <MemoryRouter>
        <BankerCrmIntelligencePanel />
      </MemoryRouter>,
    );
    scan(container);
    // Positive bank-user copy is present.
    expect(container.textContent).toMatch(/CRM active/i);
  });

  it('Banker Operating Command Center has no dev/internal copy', () => {
    const { container } = render(
      <MemoryRouter>
        <BankerOperatingCommandCenter />
      </MemoryRouter>,
    );
    scan(container);
  });
});
