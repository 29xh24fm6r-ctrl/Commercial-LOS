import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Document requirement lifecycle (real banker-managed underwriting document
 * requirement workflow, replacing DocumentChecklistPilotPanel) — no-hardcoded-
 * GUIDs guard. Every new provisioning script and application-wiring file this
 * work introduced must resolve every record it touches by a stable business
 * key (normalized document name, deal id passed in at call time) at runtime,
 * never by embedding a specific Dataverse record id in source — mirrors
 * dataverseRemediationNoHardcodedGuids.test.ts's established pattern.
 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const GUID_PATTERN = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

const FILES = [
  'scripts/dataverse/create-document-requirement-lifecycle-fields.ps1',
  'src/deals/documentRequirementLifecycle.ts',
  'src/deals/documentRequirementDerivation.ts',
  'src/deals/documentRequirementReconciliation.ts',
  'src/deals/documentRequirementActions.ts',
  'src/deals/documentRequirementLiveDeps.ts',
  'src/deals/documentRequirementLiveReader.ts',
  'src/deals/documentRequirementFields.ts',
  'src/deals/documentRequirementBlockerMerge.ts',
  'src/deals/DocumentRequirementWorkspace.tsx',
];

describe('Document requirement lifecycle — no hardcoded record GUIDs', () => {
  for (const rel of FILES) {
    it(`${rel} contains no hardcoded Dataverse record GUID`, () => {
      const src = readFileSync(resolve(REPO_ROOT, rel), 'utf8');
      const match = GUID_PATTERN.exec(src);
      expect(match, `found what looks like a hardcoded GUID in ${rel}: ${match?.[0]}`).toBeNull();
    });
  }
});
