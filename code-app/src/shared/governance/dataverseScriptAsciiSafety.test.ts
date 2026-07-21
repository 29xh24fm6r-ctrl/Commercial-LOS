import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Windows PowerShell 5.1 reads a BOM-less file in the machine's ANSI code page (usually
 * Windows-1252), so any multi-byte UTF-8 punctuation in a .ps1 (em dashes, arrows, curly quotes,
 * NBSP, the section sign) decodes to mojibake and can break parsing — exactly the failure that took
 * down scripts/dataverse/create-document-checklist-file-columns.ps1.
 *
 * This guard keeps every operator script in scripts/dataverse pure ASCII with no UTF-8 BOM, so they
 * parse identically under any code page. Keep the scripts ASCII-only; write the intended glyph as its
 * ASCII equivalent (- for dashes, -> for arrows, straight quotes, "section" for the section sign).
 */

const SCRIPTS_DIR = resolve(__dirname, '../../../scripts/dataverse');

function ps1Files(): string[] {
  return readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.ps1'));
}

describe('scripts/dataverse PowerShell scripts stay ASCII + BOM-free (PS 5.1 parse safety)', () => {
  it('finds the operator scripts to validate', () => {
    expect(ps1Files().length).toBeGreaterThan(0);
  });

  it.each(ps1Files())('%s contains no non-ASCII bytes', (file) => {
    const bytes = readFileSync(resolve(SCRIPTS_DIR, file));
    const offending: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i]! > 0x7f) {
        offending.push(`byte 0x${bytes[i]!.toString(16)} at offset ${i}`);
        if (offending.length >= 5) break;
      }
    }
    expect(offending, `${file} has non-ASCII bytes: ${offending.join(', ')}`).toEqual([]);
  });

  it.each(ps1Files())('%s has no UTF-8 BOM', (file) => {
    const b = readFileSync(resolve(SCRIPTS_DIR, file));
    const hasBom = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
    expect(hasBom, `${file} starts with a UTF-8 BOM`).toBe(false);
  });
});
