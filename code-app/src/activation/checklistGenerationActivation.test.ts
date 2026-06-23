import { describe, it, expect } from 'vitest';
import {
  generateChecklistPreview,
  generateAndWriteChecklist,
  deriveChecklistActivation,
  CHECKLIST_WRITE_ENABLED,
  type ChecklistGenerationContext,
  type ChecklistWriteInput,
} from './checklistGenerationActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

const RULES = [
  { key: 'b-financials', label: 'Financial statements' },
  { key: 'a-id', label: 'Government ID', stages: ['Application'] },
  { key: 'c-cre', label: 'Appraisal', products: ['CRE'] },
];
function ctx(over: Partial<ChecklistGenerationContext> = {}): ChecklistGenerationContext {
  return { product: 'CRE', stage: 'Application', schemaVerified: true, rules: RULES, ...over };
}
function ev(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}

describe('Phase 221 Ã¢â‚¬â€ deterministic preview', () => {
  it('blocks generation when product/stage/schema missing', () => {
    expect(generateChecklistPreview(ctx({ product: null })).status).toBe('blocked');
    expect(generateChecklistPreview(ctx({ stage: null })).status).toBe('blocked');
    expect(generateChecklistPreview(ctx({ schemaVerified: false })).status).toBe('blocked');
  });
  it('is deterministic: filtered by product+stage, sorted by key', () => {
    const p = generateChecklistPreview(ctx());
    expect(p.status).toBe('ready');
    if (p.status === 'ready') expect(p.items.map((i) => i.key)).toEqual(['a-id', 'b-financials', 'c-cre']);
  });
  it('excludes rules for other products/stages', () => {
    const p = generateChecklistPreview(ctx({ product: 'C&I', stage: 'Underwriting' }));
    if (p.status === 'ready') expect(p.items.map((i) => i.key)).toEqual(['b-financials']);
  });
});

function wInput(over: Partial<ChecklistWriteInput> = {}): ChecklistWriteInput {
  return {
    actorAuthorized: true, correlationId: 'c1', dealId: 'd1', context: ctx(),
    confirmedPreviewKeys: ['a-id', 'b-financials', 'c-cre'], existingChecklistPresent: false,
    transport: { createItems: async () => ({ ok: true }) }, auditSink: { write: async () => ({ ok: true }) },
    ...over,
  };
}

describe('Phase 228B — governed checklist write enabled with fail-closed controls', () => {
  it('is enabled by default but still requires transport and audit sink', async () => {
    expect(CHECKLIST_WRITE_ENABLED).toBe(true);
    expect((await generateAndWriteChecklist(wInput({ transport: undefined }))).outcome).toBe('blocked_generation');
  });
  it('unauthorized / blocked_generation fail closed', async () => {
    expect((await generateAndWriteChecklist(wInput({ enabled: true, actorAuthorized: false }))).outcome).toBe('unauthorized');
    expect((await generateAndWriteChecklist(wInput({ enabled: true, context: ctx({ product: null }) }))).outcome).toBe('blocked_generation');
  });
  it('duplicate_blocked unless explicit override', async () => {
    expect((await generateAndWriteChecklist(wInput({ enabled: true, existingChecklistPresent: true }))).outcome).toBe('duplicate_blocked');
    expect((await generateAndWriteChecklist(wInput({ enabled: true, existingChecklistPresent: true, overrideDuplicate: true }))).outcome).toBe('written');
  });
  it('preview_mismatch when confirmed keys differ from generated', async () => {
    expect((await generateAndWriteChecklist(wInput({ enabled: true, confirmedPreviewKeys: ['a-id'] }))).outcome).toBe('preview_mismatch');
  });
  it('write_failed / audit_failed_partial_success / timeline_failed_partial_success', async () => {
    expect((await generateAndWriteChecklist(wInput({ enabled: true, transport: { createItems: async () => ({ ok: false }) } }))).outcome).toBe('write_failed');
    expect((await generateAndWriteChecklist(wInput({ enabled: true, auditSink: { write: async () => ({ ok: false }) } }))).outcome).toBe('audit_failed_partial_success');
    expect((await generateAndWriteChecklist(wInput({ enabled: true, timelineSink: { write: async () => ({ ok: false }) } }))).outcome).toBe('timeline_failed_partial_success');
  });
  it('written on happy path with item count', async () => {
    const out = await generateAndWriteChecklist(wInput({ enabled: true }));
    expect(out.outcome).toBe('written');
    expect(out.itemCount).toBe(3);
  });
  it('activation readiness blocked by default', () => {
    expect(deriveChecklistActivation({ context: ctx(), actorAuthorized: false, auditWired: false, evidence: ev() }).level).toBe('blocked');
  });
});
