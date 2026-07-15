import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dataverse remediation (document-checklist file upload, stage sequencing) —
 * no-hardcoded-GUIDs guard. Every new provisioning script, verification
 * script, and application-wiring file this work introduced must resolve
 * every record it touches by a stable business key (email, code, entity-set
 * name) at runtime, never by embedding a specific Dataverse record id in
 * source — the same discipline every other script in this repo already
 * follows (see phase183AuditActorBridgeSeedContract.test.ts for the
 * established pattern this test mirrors).
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const GUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const FILES = [
  'scripts/dataverse/create-document-checklist-file-columns.ps1',
  'scripts/dataverse/create-dealstagereference-sequence-column.ps1',
  'scripts/dataverse/verify-document-checklist-and-stage-schema.ps1',
  'scripts/verify-datasource-manifest-completeness.mjs',
  'src/deals/documentUploadAction.ts',
  'src/deals/documentUploadLiveDeps.ts',
  'src/deals/documentChecklistFileFields.ts',
];

describe('Dataverse remediation — no hardcoded record GUIDs', () => {
  for (const rel of FILES) {
    it(`${rel} contains no hardcoded Dataverse record GUID`, () => {
      const src = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      const match = GUID_PATTERN.exec(src);
      expect(match, `found what looks like a hardcoded GUID in ${rel}: ${match?.[0]}`).toBeNull();
    });
  }
});
