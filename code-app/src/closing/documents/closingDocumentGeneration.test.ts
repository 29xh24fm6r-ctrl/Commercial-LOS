import { describe, it, expect, vi } from 'vitest';
import { generateClosingDocument, previewClosingDocument, regenerateClosingDocument } from './closingDocumentGeneration';
import { createInMemoryClosingDocumentStore } from './closingDocumentStorage';
import { findClosingDocumentTemplate } from './closingDocumentTemplateRegistry';
import type { ClosingDocumentFactModel } from './closingDocumentTypes';
import type { ResolveActorChangedBy } from '../../deals/newDealAuditActorResolver';

const template = findClosingDocumentTemplate('closing_checklist')!;

const FULL_FACTS: ClosingDocumentFactModel = {
  dealId: 'deal-1',
  dealName: 'Acme Expansion',
  borrowerLegalName: 'Acme Holdings LLC',
  product: 'Term Loan',
  loanAmount: 500_000,
};

const okResolver: ResolveActorChangedBy = async () => ({ ok: true, changedByBind: '/cr664_users(core-1)' });
const failResolver: ResolveActorChangedBy = async () => ({ ok: false, reason: 'no cr664_user bind' });

function auditSpy() {
  const calls: unknown[] = [];
  const emitAudit = vi.fn(async (event: unknown) => {
    calls.push(event);
    return { success: true };
  });
  return { emitAudit, calls };
}

describe('previewClosingDocument', () => {
  it('renders content when eligible, requiring no authorization at all', () => {
    const outcome = previewClosingDocument(template, FULL_FACTS);
    expect(outcome.kind).toBe('preview');
    if (outcome.kind === 'preview') {
      expect(outcome.renderedContent).toContain('Closing Checklist');
      expect(outcome.renderedContent).toContain('Acme Expansion');
    }
  });

  it('blocks with the eligibility reason when facts are missing — never renders partial/fabricated content', () => {
    const outcome = previewClosingDocument(template, { dealId: 'deal-1' });
    expect(outcome.kind).toBe('blocked_not_eligible');
    if (outcome.kind === 'blocked_not_eligible') expect(outcome.eligibility.kind).toBe('missing_facts');
  });
});

describe('generateClosingDocument', () => {
  it('blocks unauthorized attempts before ever touching storage', async () => {
    const store = createInMemoryClosingDocumentStore();
    const { emitAudit } = auditSpy();
    const outcome = await generateClosingDocument(
      { template, facts: FULL_FACTS, authorized: false, actorEmail: 'banker@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('blocked_unauthorized');
    expect(store.all()).toHaveLength(0);
  });

  it('blocks ineligible generation (missing facts) even when authorized', async () => {
    const store = createInMemoryClosingDocumentStore();
    const { emitAudit } = auditSpy();
    const outcome = await generateClosingDocument(
      { template, facts: { dealId: 'deal-1' }, authorized: true, actorEmail: 'banker@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('blocked_not_eligible');
    expect(store.all()).toHaveLength(0);
  });

  it('generates a manifest with full provenance and records the audit, on the happy path', async () => {
    const store = createInMemoryClosingDocumentStore();
    const { emitAudit, calls } = auditSpy();
    const outcome = await generateClosingDocument(
      { template, facts: FULL_FACTS, authorized: true, actorEmail: 'banker@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('generated');
    if (outcome.kind !== 'generated') return;
    expect(outcome.manifest.templateKey).toBe('closing_checklist');
    expect(outcome.manifest.templateVersion).toBe('1.0.0');
    expect(outcome.manifest.dealId).toBe('deal-1');
    expect(outcome.manifest.status).toBe('final');
    expect(outcome.manifest.supersedesManifestId).toBeUndefined();
    expect(outcome.manifest.contentHash).toMatch(/^[0-9a-f]{8}$/);
    expect(outcome.auditRecorded).toBe(true);
    expect(calls).toHaveLength(1);
    expect(store.all()).toHaveLength(1);
    expect(store.contentFor(outcome.manifest.manifestId)).toBe(outcome.renderedContent);
  });

  it('a failed/unresolved actor still leaves the manifest written (governance-partial), never reverts the generation', async () => {
    const store = createInMemoryClosingDocumentStore();
    const { emitAudit } = auditSpy();
    const outcome = await generateClosingDocument(
      { template, facts: FULL_FACTS, authorized: true, actorEmail: 'banker@bank.test' },
      { storage: store, emitAudit, resolveActorChangedBy: failResolver },
    );
    expect(outcome.kind).toBe('generated');
    if (outcome.kind !== 'generated') return;
    expect(outcome.auditRecorded).toBe(false);
    expect(outcome.auditError).toBeTruthy();
    expect(store.all()).toHaveLength(1); // still written
    expect(emitAudit).not.toHaveBeenCalled(); // fail-closed: never POST with no resolved actor
  });

  it('reports write_failed honestly when storage itself fails, and does not fabricate a manifest', async () => {
    const failingStore = {
      createManifestRecord: vi.fn(async () => ({ success: false, error: 'Dataverse write rejected' })),
      listManifestsForDeal: vi.fn(async () => ({ success: true, manifests: [] })),
    };
    const { emitAudit } = auditSpy();
    const outcome = await generateClosingDocument(
      { template, facts: FULL_FACTS, authorized: true, actorEmail: 'banker@bank.test' },
      { storage: failingStore, emitAudit, resolveActorChangedBy: okResolver },
    );
    expect(outcome.kind).toBe('write_failed');
    if (outcome.kind === 'write_failed') expect(outcome.error).toBe('Dataverse write rejected');
    expect(emitAudit).not.toHaveBeenCalled();
  });
});

describe('regenerateClosingDocument', () => {
  it('creates a NEW manifest that supersedes the prior one, without mutating the prior manifest', async () => {
    const store = createInMemoryClosingDocumentStore();
    const { emitAudit } = auditSpy();
    const deps = { storage: store, emitAudit, resolveActorChangedBy: okResolver };

    const first = await generateClosingDocument(
      { template, facts: FULL_FACTS, authorized: true, actorEmail: 'banker@bank.test' },
      deps,
    );
    expect(first.kind).toBe('generated');
    if (first.kind !== 'generated') return;

    const second = await regenerateClosingDocument(
      { template, facts: { ...FULL_FACTS, loanAmount: 600_000 }, authorized: true, actorEmail: 'banker@bank.test' },
      first.manifest,
      deps,
    );
    expect(second.kind).toBe('generated');
    if (second.kind !== 'generated') return;

    expect(second.manifest.manifestId).not.toBe(first.manifest.manifestId);
    expect(second.manifest.supersedesManifestId).toBe(first.manifest.manifestId);
    expect(store.all()).toHaveLength(2);
    // The prior manifest object itself is untouched.
    expect(store.all()[0]).toEqual(first.manifest);
  });
});
