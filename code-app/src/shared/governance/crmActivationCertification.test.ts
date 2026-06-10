import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 143J — CRM activation arc certification.
 *
 * Pins that the Phase 143A–143I CRM activation stack is certified as a controlled,
 * no-uncontrolled-live-write, disabled / dry-run / read-only Salesforce + nCino
 * activation layer, with rollback/kill-switch and live-activation prerequisites
 * documented and explicit non-certifications stated.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CERT_DOC = 'docs/PHASE_143J_CRM_ACTIVATION_CERTIFICATION_AND_ROLLBACK.md';

const PHASE_143_DOCS: readonly string[] = [
  'docs/PHASE_143A_CRM_ACTIVATION_INVENTORY_SOURCE_OF_TRUTH.md',
  'docs/PHASE_143B_SALESFORCE_NCINO_CONNECTOR_READINESS_AUDIT.md',
  'docs/PHASE_143C_CRM_IDENTITY_ENTITY_MATCHING_MODEL.md',
  'docs/PHASE_143D_CRM_SYNC_PREVIEW_NO_WRITES.md',
  'docs/PHASE_143E_CRM_WRITEBACK_POLICY_GATE_DISABLED.md',
  'docs/PHASE_143F_CRM_CONTROLLED_WRITEBACK_DRY_RUN_ADAPTER.md',
  'docs/PHASE_143G_CRM_ACTIVITY_TIMELINE_ENRICHMENT_READ_ONLY.md',
  'docs/PHASE_143H_CRM_RELATIONSHIP_INTELLIGENCE_COCKPIT.md',
  'docs/PHASE_143I_CRM_ALLOWLISTED_LIVE_WRITE_PILOT_SCAFFOLD.md',
  CERT_DOC,
];

describe('Phase 143J — required docs exist', () => {
  for (const rel of [...PHASE_143_DOCS, 'src/shared/governance/crmActivationCertification.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 143J — certification doc states required guarantees', () => {
  const doc = readFileSync(resolve(REPO_ROOT, CERT_DOC), 'utf8');
  const REQUIRED: ReadonlyArray<[string, RegExp]> = [
    ['no uncontrolled live writes', /no uncontrolled live writes/i],
    ['no live Salesforce/nCino calls', /no live salesforce\s*\/\s*ncino calls|no live salesforce/i],
    ['no credentials/secrets/env vars', /no credentials\s*\/\s*secrets\s*\/\s*env vars|no credentials/i],
    ['no Dataverse writes', /no Dataverse writes/i],
    ['no schema migration', /no schema migration/i],
    ['no permission widening', /no permission widening/i],
    ['no fake sync success', /no fake sync success/i],
    ['no fake CRM data', /no fake CRM data/i],
    ['no credit decisioning', /no credit decisioning/i],
    ['no committee voting', /no committee voting/i],
    ['no money movement', /no money movement/i],
    ['disabled/dry-run/read-only guarantees', /disabled\s*\/\s*dry-run\s*\/\s*read-only/i],
    ['rollback / kill-switch', /rollback\s*\/\s*kill[- ]?switch/i],
    ['live activation prerequisites', /live activation prerequisites/i],
    ['explicit non-certifications', /explicit non-certifications/i],
  ];
  for (const [label, rx] of REQUIRED) {
    it(`mentions ${label}`, () => {
      expect(doc).toMatch(rx);
    });
  }

  it('pins the key disabled/dry-run/read-only booleans in the guarantees section', () => {
    for (const literal of ['liveWritePerformed: false', 'allowedForLiveWriteNow: false', 'dryRunOnly: true', 'readOnly: true', 'liveWritePilotEnabled: false']) {
      expect(doc).toContain(literal);
    }
  });
});
