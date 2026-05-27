import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { palette, severityPalette } from './theme';

/**
 * Phase 79 — dark theme token foundation tests.
 *
 * Pins:
 *   - every value exported on `palette` is a CSS variable reference
 *     (var(--cc-*)), not a hex / rgb / named color literal. This is
 *     what lets the live theme follow OS or data-theme overrides
 *     without any consumer change.
 *   - every var() name referenced by `palette` is declared in
 *     src/index.css under BOTH the light :root block and the
 *     dark theme blocks.
 *   - src/index.css contains the prefers-color-scheme dark media
 *     query, the [data-theme="dark"] explicit override, and the
 *     color-scheme declarations for both themes.
 *   - severityPalette (Badge / StatusDot consumer) flows through
 *     palette and therefore inherits theme-token indirection.
 *   - Phase 79 introduces no governed write, no new
 *     LOCAL_ONLY_FLOWS entry, no schema work.
 */

const REPO_SRC = resolve(__dirname, '..');

const INDEX_CSS_RAW = readFileSync(resolve(REPO_SRC, 'index.css'), 'utf8');
// Strip /* ... */ comments before scanning — class-rule and var-block
// regexes shouldn't be tricked by a comment that names a class or
// references a hex color in prose.
const INDEX_CSS = INDEX_CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, '');

function extractVarName(value: string): string | null {
  const m = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  return m ? m[1]! : null;
}

describe('Phase 79 — theme tokens', () => {
  describe('palette is a CSS variable surface', () => {
    it('every palette value is a var(--cc-*) reference, not a literal', () => {
      const offenders: Array<{ key: string; value: string }> = [];
      for (const [key, value] of Object.entries(palette)) {
        const name = extractVarName(value);
        if (!name) {
          offenders.push({ key, value });
          continue;
        }
        // All theme tokens carry the --cc- namespace prefix.
        expect(name.startsWith('--cc-')).toBe(true);
      }
      expect(offenders).toEqual([]);
    });

    it('palette key set is non-empty and includes the surfaces the rest of the app depends on', () => {
      expect(Object.keys(palette).length).toBeGreaterThan(0);
      // Spot-check a handful of identifiers the rest of the codebase
      // imports by name; if any of these were renamed, hundreds of
      // consumers would break and the rest of the suite would catch it.
      expect(palette.text).toMatch(/^var\(--cc-/);
      expect(palette.surface).toMatch(/^var\(--cc-/);
      expect(palette.primary).toMatch(/^var\(--cc-/);
      expect(palette.blocked).toMatch(/^var\(--cc-/);
      expect(palette.atRisk).toMatch(/^var\(--cc-/);
      expect(palette.clear).toMatch(/^var\(--cc-/);
      expect(palette.neutral).toMatch(/^var\(--cc-/);
      expect(palette.info).toMatch(/^var\(--cc-/);
    });
  });

  describe('index.css declares the variables in both themes', () => {
    it('declares every --cc-* identifier referenced by palette under :root (light theme)', () => {
      const rootBlockMatch = INDEX_CSS.match(/:root\s*\{([\s\S]*?)\n\}/);
      expect(rootBlockMatch).not.toBeNull();
      const rootBlock = rootBlockMatch![1]!;
      for (const value of Object.values(palette)) {
        const name = extractVarName(value);
        expect(name).not.toBeNull();
        expect(rootBlock).toContain(`${name!}:`);
      }
    });

    it('declares the same set of identifiers under a prefers-color-scheme: dark block', () => {
      // The dark block is gated by both the OS preference and the
      // :not([data-theme='light']) clause so the light explicit
      // override takes precedence. Slice from the @media start through
      // the next :root[data-theme='dark'] declaration (or EOF) — that
      // window is the entire OS-preference dark block.
      const startIdx = INDEX_CSS.search(
        /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/,
      );
      expect(startIdx).toBeGreaterThan(-1);
      // The next top-level block after the @media is the explicit
      // [data-theme='dark'] selector; use it as the upper bound.
      const afterMediaIdx = INDEX_CSS.indexOf(":root[data-theme='dark']");
      expect(afterMediaIdx).toBeGreaterThan(startIdx);
      const darkBlock = INDEX_CSS.slice(startIdx, afterMediaIdx);
      for (const value of Object.values(palette)) {
        const name = extractVarName(value);
        expect(name).not.toBeNull();
        expect(darkBlock).toContain(`${name!}:`);
      }
    });

    it('declares the same set under the explicit [data-theme="dark"] override', () => {
      const explicitDarkMatch = INDEX_CSS.match(
        /:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/,
      );
      expect(explicitDarkMatch).not.toBeNull();
      const explicitDarkBlock = explicitDarkMatch![1]!;
      for (const value of Object.values(palette)) {
        const name = extractVarName(value);
        expect(name).not.toBeNull();
        expect(explicitDarkBlock).toContain(`${name!}:`);
      }
    });

    it('declares color-scheme in both light and dark contexts', () => {
      // Light: in the :root block.
      expect(INDEX_CSS).toMatch(/:root\s*\{[\s\S]*?color-scheme:\s*light/);
      // Dark: inside the prefers-color-scheme dark block.
      expect(INDEX_CSS).toMatch(
        /@media\s*\(\s*prefers-color-scheme:\s*dark[\s\S]*?color-scheme:\s*dark/,
      );
      // Explicit override: data-theme="dark" also declares dark.
      expect(INDEX_CSS).toMatch(
        /\[data-theme='dark'\][\s\S]*?color-scheme:\s*dark/,
      );
    });

    it('preserves the existing focus-ring, link, and table utility classes via CSS variables', () => {
      // The existing .cc-row-hover / .cc-link / .cc-th / .cc-td
      // classes were rewritten in Phase 79 to consume --cc-* tokens
      // so dark mode follows automatically.
      expect(INDEX_CSS).toMatch(
        /\.cc-row-hover:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid\s+var\(--cc-focus-ring\)/,
      );
      expect(INDEX_CSS).toMatch(
        /\.cc-link[^}]*\{[\s\S]*?color:\s*var\(--cc-link\)/,
      );
      expect(INDEX_CSS).toMatch(
        /\.cc-th\s*\{[\s\S]*?background:\s*var\(--cc-surface-alt\)/,
      );
      expect(INDEX_CSS).toMatch(/\.cc-td\s*\{[\s\S]*?color:\s*var\(--cc-text\)/);
    });

    it('does not redeclare hardcoded hex colors inside class rules', () => {
      // The utility classes used to carry literal hex values. Phase 79
      // moved them to CSS variables; pin that they don't drift back.
      const classRules = INDEX_CSS.match(/\.cc-[a-z-]+[^{]*\{[^}]+\}/g) ?? [];
      for (const rule of classRules) {
        expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      }
    });
  });

  describe('severityPalette inherits theme-token indirection', () => {
    it('every fg / bg / bar / dot value is a var(--cc-*) reference', () => {
      const offenders: Array<{ severity: string; key: string; value: string }> =
        [];
      for (const [severity, slot] of Object.entries(severityPalette)) {
        for (const key of ['fg', 'bg', 'bar', 'dot'] as const) {
          const value = slot[key];
          const name = extractVarName(value);
          if (!name) offenders.push({ severity, key, value });
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('Phase 79 governance posture', () => {
    it('introduces no new GOVERNED_WRITES entry (theme tokens are visual-only)', async () => {
      const inventory = await import('./governance/platformInventory');
      const ids = new Set(inventory.GOVERNED_WRITES.map((w) => w.id));
      // No "theme-preference-save" or similar entry was introduced in
      // Phase 79 — theme tokens are visual-only and require no
      // governed write. (The GOVERNED_WRITES inventory has grown
      // since Phase 79; this test pins what's NOT added, not a count.)
      expect(ids.has('theme-preference-save')).toBe(false);
      expect(ids.has('user-preference-save')).toBe(false);
    });

    it('introduces no new LOCAL_ONLY_FLOWS entry (no preference persistence in this phase)', async () => {
      const inventory = await import('./governance/platformInventory');
      const ids = new Set(inventory.LOCAL_ONLY_FLOWS.map((f) => f.id));
      // Phase 79 explicitly defers user-selectable theme persistence.
      // No localStorage write either, so no LOCAL_ONLY_FLOWS entry is
      // needed. The dark theme follows OS preference automatically.
      expect(ids.has('theme-preference')).toBe(false);
      expect(ids.has('dark-mode-toggle')).toBe(false);
    });
  });
});
