import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSPACE_DISPLAY_NAMES } from '../bootstrap/workspaceRoutes';

/**
 * Final LOS Completion arc — Workstream Q: static-source discipline pin.
 *
 * Before this workstream, AppCommandPalette.tsx maintained its own
 * `WORKSPACE_LABELS` map with a different, inconsistent casing from the
 * live-system names ("Manager command center" vs. the audited
 * "Manager Command Center") — a second, drifted copy of the same five
 * labels. This pins that the palette now sources its workspace labels
 * from the one canonical `WORKSPACE_DISPLAY_NAMES` export instead of
 * retyping its own copy, so the two can never drift apart again.
 */
describe('Workstream Q — AppCommandPalette sources workspace labels from WORKSPACE_DISPLAY_NAMES', () => {
  const src = readFileSync(resolve(__dirname, 'AppCommandPalette.tsx'), 'utf8');

  it('imports WORKSPACE_DISPLAY_NAMES from workspaceRoutes', () => {
    expect(src).toMatch(/import\s*{[^}]*WORKSPACE_DISPLAY_NAMES[^}]*}\s*from\s*['"]\.\.\/bootstrap\/workspaceRoutes['"]/);
  });

  it('does not maintain its own second workspace-label map', () => {
    expect(src).not.toMatch(/WORKSPACE_LABELS/);
  });

  it('every canonical display name is Title Case (no lowercase-second-word drift)', () => {
    for (const name of Object.values(WORKSPACE_DISPLAY_NAMES)) {
      const words = name.split(' ');
      for (const word of words) {
        expect(word.charAt(0)).toBe(word.charAt(0).toUpperCase());
      }
    }
  });
});
