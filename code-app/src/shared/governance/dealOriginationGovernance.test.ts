import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 171-180 -- deal origination operating arc governance pins.
 *
 * Static-source guards over every arc file: no hardcoded Stage/Status GUIDs,
 * no bypass/suppress/force headers, no Graph/external HTTP/Twilio/email
 * imports (default no external HTTP), no generated-service/SDK import (the arc
 * is injected-IO only), and no destructive merge/delete.
 */

const ROOT = resolve(__dirname, '..', '..', '..');

const ARC_FILES = [
  'src/deals/dealOriginationOutcomes.ts',
  'src/deals/dealOriginationFeatureFlags.ts',
  'src/deals/dealOriginationAudit.ts',
  'src/deals/dealOriginationOrchestrator.ts',
  'src/deals/dealCrmAutomationAdapter.ts',
  'src/deals/borrowerInviteAutomationAdapter.ts',
  'src/deals/autoStageAdvanceAdapter.ts',
  'src/deals/newDealTaskGenerationAdapter.ts',
  'src/deals/newDealChecklistGenerationAdapter.ts',
  'src/deals/newDealPortfolioSideEffectsAdapter.ts',
  'src/deals/borrowerMessagingAdapter.ts',
  'src/deals/newDealDuplicateDetection.ts',
] as const;

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('arc governance -- no hardcoded GUIDs', () => {
  for (const rel of ARC_FILES) {
    it(`${rel} hardcodes no Dataverse record GUID`, () => {
      expect(read(rel)).not.toMatch(
        /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
      );
    });
  }
});

describe('arc governance -- no bypass/suppress/force headers', () => {
  for (const rel of ARC_FILES) {
    it(`${rel} uses no bypass/suppress/force header`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/BypassBusinessLogicExecution/i);
      expect(src).not.toMatch(/BypassCustomPluginExecution/i);
      expect(src).not.toMatch(/SuppressDuplicateDetection/i);
      expect(src).not.toMatch(/[?&]Force=true/i);
    });
  }
});

describe('arc governance -- no external HTTP / Graph / Twilio / email by default', () => {
  for (const rel of ARC_FILES) {
    it(`${rel} performs no external transport`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/graph\.microsoft\.com/i);
      // No twilio / email transport IMPORT or call (the JSDoc may name Twilio
      // as a documented, still-disabled future capability).
      expect(src).not.toMatch(/from\s+['"][^'"]*twilio|require\(\s*['"][^'"]*twilio/i);
      expect(src).not.toMatch(/SendEmail\s*\(|Office365OutlookService/i);
    });
  }
});

describe('arc governance -- injected IO only (no generated service / SDK import)', () => {
  for (const rel of ARC_FILES) {
    it(`${rel} imports no generated service`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/from '\.\.?\/generated\//);
      expect(src).not.toMatch(/@microsoft\/power-apps/);
    });
  }
});

describe('arc governance -- duplicate detection is non-destructive (no merge/delete)', () => {
  const dup = read('src/deals/newDealDuplicateDetection.ts');
  it('never issues a delete / patch / overwrite write call and never returns a "merged" status', () => {
    // Target actual write-call shapes, not the honest JSDoc that *describes*
    // the non-capability.
    expect(dup).not.toMatch(/deleteRecord|deleteAsync|\.delete\s*\(/i);
    expect(dup).not.toMatch(/updateRecord|updateAsync|\.update\s*\(|method:\s*'(PATCH|DELETE)'/i);
    expect(dup).not.toMatch(/kind:\s*'merged'/);
  });
  it('merge preparation returns applied:false / merge_prepared_not_applied', () => {
    expect(dup).toMatch(/applied: false/);
    expect(dup).toMatch(/merge_prepared_not_applied/);
  });
});

describe('arc governance -- risk domain gates stay hard-false post-launch', () => {
  it('the still-gated feature flag constants remain false', async () => {
    const flags = await import('../../deals/dealOriginationFeatureFlags');
    for (const key of [
      'BANKER_NEW_DEAL_CREATE_ENABLED',
      'CRM_AUTOMATION_ENABLED',
      'BORROWER_INVITE_AUTOMATION_ENABLED',
      'PORTFOLIO_SIDE_EFFECTS_ENABLED',
      'BORROWER_SMS_TRANSPORT_ENABLED',
      'BORROWER_TWILIO_TRANSPORT_ENABLED',
      'DUPLICATE_MERGE_APPLY_ENABLED',
    ]) {
      expect((flags as Record<string, unknown>)[key]).toBe(false);
    }
  });

  it('the still-gated live-write constants are at their safe default (off); stage advance is WF-1A-armed', async () => {
    const flags = await import('../../deals/dealOriginationFeatureFlags');
    for (const key of [
      'DOCUMENT_CHECKLIST_GENERATION_ENABLED',
      'BORROWER_MESSAGING_ENABLED',
      'BORROWER_EMAIL_TRANSPORT_ENABLED',
    ]) {
      expect((flags as Record<string, unknown>)[key]).toBe(false);
    }
    // WF-1A: AUTO_STAGE_ADVANCE_ENABLED is INTENTIONALLY armed for the "walk one deal"
    // pilot (a deliberate per-domain arming, not an up-by-default). Governed explicit
    // advancement only; the uncontrolled auto-advance write gate stays off elsewhere.
    expect((flags as Record<string, unknown>).AUTO_STAGE_ADVANCE_ENABLED).toBe(true);
  });

  it('the other two Completion-Phase-A-armed domains stay armed (this file is the single pin for every non-default flag)', async () => {
    // Kept alongside AUTO_STAGE_ADVANCE_ENABLED above so a reviewer scanning only
    // this "risk domain gates" file sees the FULL set of armed domains, not just
    // stage-advance -- TASK_GENERATION_ENABLED and DUPLICATE_DETECTION_ENABLED are
    // also true and were previously unpinned here (each is separately pinned
    // elsewhere -- dealOriginationFeatureFlags.test.ts -- but that doesn't help a
    // reader relying on this file's "risk domain gates" framing).
    const flags = await import('../../deals/dealOriginationFeatureFlags');
    expect((flags as Record<string, unknown>).TASK_GENERATION_ENABLED).toBe(true);
    expect((flags as Record<string, unknown>).DUPLICATE_DETECTION_ENABLED).toBe(true);
  });
});
