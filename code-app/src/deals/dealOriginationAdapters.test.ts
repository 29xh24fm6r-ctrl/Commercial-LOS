import { describe, it, expect, vi } from 'vitest';
import { runDealCrmAutomation, CRM_AUTOMATION_ALLOWED_FIELDS } from './dealCrmAutomationAdapter';
import { runBorrowerInviteAutomation } from './borrowerInviteAutomationAdapter';
import { runAutoStageAdvance } from './autoStageAdvanceAdapter';
import { runNewDealTaskGeneration, TASK_GENERATION_ALLOWED_FIELDS } from './newDealTaskGenerationAdapter';
import { runNewDealChecklistGeneration } from './newDealChecklistGenerationAdapter';
import { runNewDealPortfolioSideEffects } from './newDealPortfolioSideEffectsAdapter';
import { runBorrowerMessaging } from './borrowerMessagingAdapter';
import {
  detectNewDealDuplicates,
  prepareNewDealDuplicateMerge,
} from './newDealDuplicateDetection';

/**
 * Phase 172A-179A -- downstream adapters: disabled-by-default + key paths.
 * Every IO is injected; nothing runs while disabled.
 */

const base = {
  dealId: 'deal-1',
  actorSystemUserId: 'sys-1',
  authorized: true,
  correlationId: 'c1',
};

describe('172A CRM automation', () => {
  it('disabled returns before any CRM IO', async () => {
    const io = vi.fn();
    const out = await runDealCrmAutomation({ ...base }, io);
    expect(out.kind).toBe('disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('missing deal id blocks', async () => {
    expect((await runDealCrmAutomation({ ...base, dealId: undefined, enabledOverride: true })).kind).toBe(
      'dependency_not_ready',
    );
  });
  it('unauthorized blocks', async () => {
    expect((await runDealCrmAutomation({ ...base, authorized: false, enabledOverride: true })).kind).toBe(
      'unauthorized',
    );
  });
  it('no approved relationship -> skipped_not_applicable', async () => {
    expect((await runDealCrmAutomation({ ...base, enabledOverride: true })).kind).toBe('skipped_not_applicable');
  });
  it('success uses only allow-listed fields', async () => {
    const io = vi.fn(async (p: Record<string, unknown>) => {
      for (const k of Object.keys(p)) expect(CRM_AUTOMATION_ALLOWED_FIELDS).toContain(k);
      return { ok: true };
    });
    const out = await runDealCrmAutomation({ ...base, enabledOverride: true, crmLinkSupported: true }, io);
    expect(out.kind).toBe('success');
    expect(io).toHaveBeenCalledTimes(1);
  });
});

describe('173A borrower invite', () => {
  it('disabled returns before transport', async () => {
    const io = vi.fn();
    expect((await runBorrowerInviteAutomation({ ...base }, io)).kind).toBe('disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('missing contact -> skipped_missing_borrower_contact (does not fail create)', async () => {
    expect((await runBorrowerInviteAutomation({ ...base, modeOverride: 'prepare_only' })).kind).toBe(
      'skipped_missing_borrower_contact',
    );
  });
  it('prepare_only -> prepared_not_sent, no transport', async () => {
    const io = vi.fn();
    const out = await runBorrowerInviteAutomation(
      { ...base, modeOverride: 'prepare_only', borrowerEmail: 'b@x.test' },
      io,
    );
    expect(out.kind).toBe('prepared_not_sent');
    expect(io).not.toHaveBeenCalled();
  });
  it('send requires a transport gate AND mocked transport success', async () => {
    const io = vi.fn(async () => ({ ok: true }));
    const out = await runBorrowerInviteAutomation(
      { ...base, modeOverride: 'send_enabled', transportEnabledOverride: true, borrowerEmail: 'b@x.test' },
      io,
    );
    expect(out.kind).toBe('sent');
    expect(io).toHaveBeenCalledTimes(1);
  });
});

describe('174A auto-stage advance', () => {
  it('disabled returns before stage write', async () => {
    const io = vi.fn();
    expect((await runAutoStageAdvance({ ...base }, io)).kind).toBe('disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('stage mismatch -> skipped_stage_mismatch', async () => {
    expect(
      (
        await runAutoStageAdvance({
          ...base,
          enabledOverride: true,
          policyAllows: true,
          readinessMet: true,
          currentStageCode: 'NEW',
          approvedSourceStageCode: 'INTAKE',
        })
      ).kind,
    ).toBe('skipped_stage_mismatch');
  });
  it('readiness blocked -> skipped_not_ready', async () => {
    expect((await runAutoStageAdvance({ ...base, enabledOverride: true, policyAllows: true, readinessMet: false })).kind).toBe(
      'skipped_not_ready',
    );
  });
  it('missing target -> resolver_not_ready', async () => {
    expect(
      (
        await runAutoStageAdvance({
          ...base,
          enabledOverride: true,
          policyAllows: true,
          readinessMet: true,
          currentStageCode: 'NEW',
          approvedSourceStageCode: 'NEW',
        })
      ).kind,
    ).toBe('resolver_not_ready');
  });
  it('success requires approved source/target', async () => {
    const io = vi.fn(async () => ({ ok: true }));
    const out = await runAutoStageAdvance(
      {
        ...base,
        enabledOverride: true,
        policyAllows: true,
        readinessMet: true,
        currentStageCode: 'NEW',
        approvedSourceStageCode: 'NEW',
        targetStageBind: '/cr664_dealstagereferences(resolved-id)',
      },
      io,
    );
    expect(out.kind).toBe('success');
  });
});

describe('175A task generation', () => {
  it('disabled returns before task IO', async () => {
    const io = vi.fn();
    expect((await runNewDealTaskGeneration({ ...base }, io)).kind).toBe('disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('no template -> skipped_no_template', async () => {
    expect((await runNewDealTaskGeneration({ ...base, enabledOverride: true })).kind).toBe('skipped_no_template');
  });
  it('all duplicates -> skipped_duplicate_detected', async () => {
    expect(
      (
        await runNewDealTaskGeneration({
          ...base,
          enabledOverride: true,
          templateTaskNames: ['Complete intake review'],
          existingTaskNames: ['complete intake review'],
        })
      ).kind,
    ).toBe('skipped_duplicate_detected');
  });
  it('partial failure surfaced; payload allow-listed', async () => {
    let call = 0;
    const io = vi.fn(async (p: Record<string, unknown>) => {
      for (const k of Object.keys(p)) expect(TASK_GENERATION_ALLOWED_FIELDS).toContain(k);
      call += 1;
      return { ok: call === 1 };
    });
    const out = await runNewDealTaskGeneration(
      { ...base, enabledOverride: true, templateTaskNames: ['A', 'B'] },
      io,
    );
    expect(out.kind).toBe('partial_success');
  });
});

describe('176A document checklist', () => {
  it('disabled returns before document IO', async () => {
    const io = vi.fn();
    expect((await runNewDealChecklistGeneration({ ...base }, io)).kind).toBe('disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('no template -> skipped_no_template', async () => {
    expect((await runNewDealChecklistGeneration({ ...base, enabledOverride: true })).kind).toBe('skipped_no_template');
  });
  it('success creates rows in mock; no borrower message', async () => {
    const io = vi.fn(async () => ({ ok: true }));
    const out = await runNewDealChecklistGeneration(
      { ...base, enabledOverride: true, templateDocumentNames: ['Tax Returns'] },
      io,
    );
    expect(out.kind).toBe('success');
  });
});

describe('177A portfolio side effects', () => {
  it('disabled returns before portfolio IO', async () => {
    const io = vi.fn();
    expect((await runNewDealPortfolioSideEffects({ ...base }, io)).kind).toBe('disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('derived portfolio -> skipped_not_needed', async () => {
    expect(
      (await runNewDealPortfolioSideEffects({ ...base, enabledOverride: true, portfolioDerivesFromDeal: true })).kind,
    ).toBe('skipped_not_needed');
  });
  it('no mapping -> skipped_no_portfolio_mapping', async () => {
    expect(
      (
        await runNewDealPortfolioSideEffects({
          ...base,
          enabledOverride: true,
          portfolioDerivesFromDeal: false,
          explicitMappingApproved: false,
        })
      ).kind,
    ).toBe('skipped_no_portfolio_mapping');
  });
});

describe('178A borrower messaging', () => {
  it('disabled returns before messaging IO', async () => {
    const io = vi.fn();
    expect((await runBorrowerMessaging({ ...base }, io)).kind).toBe('disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('template missing -> skipped_template_missing', async () => {
    expect((await runBorrowerMessaging({ ...base, modeOverride: 'prepare_only' })).kind).toBe(
      'skipped_template_missing',
    );
  });
  it('transport disabled -> skipped_transport_disabled', async () => {
    const io = vi.fn();
    const out = await runBorrowerMessaging(
      { ...base, modeOverride: 'send_enabled', templateKey: 'welcome', borrowerEmail: 'b@x.test' },
      io,
    );
    expect(out.kind).toBe('skipped_transport_disabled');
    expect(io).not.toHaveBeenCalled();
  });
  it('sent requires mocked transport success', async () => {
    const io = vi.fn(async () => ({ ok: true }));
    const out = await runBorrowerMessaging(
      {
        ...base,
        modeOverride: 'send_enabled',
        transportEnabledOverride: true,
        templateKey: 'welcome',
        borrowerEmail: 'b@x.test',
      },
      io,
    );
    expect(out.kind).toBe('sent');
  });
});

describe('179A duplicate detection + merge prepare-only', () => {
  it('disabled -> not_checked', () => {
    expect(detectNewDealDuplicates({ candidateDealName: 'X', existing: [] }).kind).toBe('not_checked');
  });
  it('no duplicate -> no_duplicate_found', () => {
    expect(
      detectNewDealDuplicates({ detectionEnabledOverride: true, candidateDealName: 'X', existing: [] }).kind,
    ).toBe('no_duplicate_found');
  });
  it('exact name -> exact_duplicate_found with candidate id', () => {
    const out = detectNewDealDuplicates({
      detectionEnabledOverride: true,
      candidateDealName: 'Acme',
      existing: [{ dealId: 'd9', dealName: 'acme' }],
    });
    expect(out.kind).toBe('exact_duplicate_found');
    expect(out.candidates).toEqual(['d9']);
  });
  it('possible duplicate -> warning only', () => {
    const out = detectNewDealDuplicates({
      detectionEnabledOverride: true,
      candidateDealName: 'New',
      candidateClientName: 'Globex LLC',
      existing: [{ dealId: 'd9', dealName: 'Other', clientName: 'globex llc' }],
    });
    expect(out.kind).toBe('possible_duplicate_found');
  });
  it('merge is prepare-only and never applied', () => {
    const dup = detectNewDealDuplicates({
      detectionEnabledOverride: true,
      candidateDealName: 'Acme',
      existing: [{ dealId: 'd9', dealName: 'acme' }],
    });
    const prep = prepareNewDealDuplicateMerge(dup, 'surviving-1');
    expect(prep.kind).toBe('merge_prepared_not_applied');
    expect(prep.detail).toMatch(/no change applied/i);
  });
});
