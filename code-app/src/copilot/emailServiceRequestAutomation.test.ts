import { describe, expect, it, vi } from 'vitest';
import { createSha256CreditIntelligenceHashPort } from './creditIntelligenceHash';
import { processInboundServiceRequestEmail, type EmailServiceRequestPorts, type ServiceRequestClassification } from './emailServiceRequestAutomation';

const envelope = {
  mailboxId: 'service@oldglorybank.com', internetMessageId: '<message-1@customer.com>', receivedAt: '2026-07-31T14:00:00.000Z',
  senderAddress: 'customer@example.com', subject: 'Please update my insurance', bodyText: 'Please record the attached renewal.', hasAttachments: true,
} as const;
const classification: ServiceRequestClassification = {
  isServiceRequest: true, category: 'servicing_request', confidence: .98, suggestedTaskTitle: 'Review insurance renewal',
  companyHints: ['Example Co'], personHints: [], dealHints: ['Loan 100'], rationale: 'Explicit servicing request.',
  suspiciousContent: false, usedProtectedCharacteristic: false,
};
const policy = { monitoredMailboxIds: [envelope.mailboxId], allowedCategories: ['servicing_request'] as const, automaticTaskCreation: true, minimumConfidence: .9, maximumMessageAgeHours: 24, defaultDueHours: 8 };

function ports(overrides: Partial<EmailServiceRequestPorts> = {}): EmailServiceRequestPorts {
  const claims = new Map<string, string>();
  return {
    hash: createSha256CreditIntelligenceHashPort(), now: () => new Date('2026-07-31T15:00:00.000Z'), newCorrelationId: () => crypto.randomUUID(),
    identity: { resolveServiceActor: vi.fn(async () => ({ kind: 'authorized' as const, systemUserId: 'service-user' })) },
    classifier: { classify: vi.fn(async () => classification) },
    matcher: { resolve: vi.fn(async () => ({ kind: 'unique' as const, dealId: 'deal-1', assigneeSystemUserId: 'user-1', assigneeDisplayName: 'Banker' })) },
    persistence: {
      claim: vi.fn(async ({ idempotencyKey, contentHash }) => {
        const existing = claims.get(idempotencyKey);
        if (existing === contentHash) return 'duplicate' as const;
        if (existing) return 'conflict' as const;
        claims.set(idempotencyKey, contentHash); return 'claimed' as const;
      }),
      persistIntake: vi.fn(async () => ({ intakeId: crypto.randomUUID() })),
      createMonitoredTask: vi.fn(async () => ({ taskId: 'task-1', auditEventId: 'audit-1', timelineEventId: 'timeline-1' })),
    },
    ...overrides,
  };
}

describe('processInboundServiceRequestEmail', () => {
  it('creates a due-dated monitored task only for an authorized, confident, uniquely matched request', async () => {
    const deps = ports();
    const result = await processInboundServiceRequestEmail(envelope, policy, deps);
    expect(result).toMatchObject({ kind: 'task-created', taskId: 'task-1' });
    expect(deps.persistence.createMonitoredTask).toHaveBeenCalledWith(expect.objectContaining({ dealId: 'deal-1', assigneeSystemUserId: 'user-1', dueAt: '2026-07-31T23:00:00.000Z' }));
    expect(deps.persistence.persistIntake).toHaveBeenCalledWith(expect.objectContaining({ status: 'task_created', taskId: 'task-1', evaluationHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it('routes low-confidence, ambiguous, suspicious, and disallowed requests to human triage without a task', async () => {
    for (const variant of [
      { c: { ...classification, confidence: .4 }, match: undefined },
      { c: classification, match: { kind: 'ambiguous' as const, reason: 'Two matching deals.' } },
      { c: { ...classification, suspiciousContent: true }, match: undefined },
      { c: { ...classification, category: 'suspected_fraud' as const }, match: undefined },
    ]) {
      const deps = ports({
        classifier: { classify: vi.fn(async () => variant.c) },
        ...(variant.match ? { matcher: { resolve: vi.fn(async () => variant.match!) } } : {}),
      });
      expect((await processInboundServiceRequestEmail({ ...envelope, internetMessageId: `<${crypto.randomUUID()}@test>` }, policy, deps)).kind).toBe('triage-required');
      expect(deps.persistence.createMonitoredTask).not.toHaveBeenCalled();
    }
  });

  it('rejects unauthorized mailboxes, unresolved service identity, stale mail, and protected-characteristic use', async () => {
    expect((await processInboundServiceRequestEmail({ ...envelope, mailboxId: 'other@oldglorybank.com' }, policy, ports())).kind).toBe('blocked');
    expect((await processInboundServiceRequestEmail(envelope, policy, ports({ identity: { resolveServiceActor: async () => ({ kind: 'blocked', reason: 'No service identity.' }) } }))).kind).toBe('blocked');
    expect((await processInboundServiceRequestEmail({ ...envelope, receivedAt: '2026-07-20T00:00:00Z' }, policy, ports())).kind).toBe('blocked');
    const protectedDeps = ports({ classifier: { classify: async () => ({ ...classification, usedProtectedCharacteristic: true }) } });
    expect(await processInboundServiceRequestEmail(envelope, policy, protectedDeps)).toMatchObject({ kind: 'blocked', code: 'PROTECTED_CHARACTERISTIC_REJECTED' });
  });

  it('treats non-service mail as audited intake without creating a task', async () => {
    const deps = ports({ classifier: { classify: async () => ({ ...classification, isServiceRequest: false }) } });
    expect((await processInboundServiceRequestEmail(envelope, policy, deps)).kind).toBe('ignored');
    expect(deps.persistence.createMonitoredTask).not.toHaveBeenCalled();
  });

  it('atomically deduplicates two simultaneous deliveries so only one task is created', async () => {
    const deps = ports();
    const results = await Promise.all([
      processInboundServiceRequestEmail(envelope, policy, deps),
      processInboundServiceRequestEmail(envelope, policy, deps),
    ]);
    expect(results.map(result => result.kind).sort()).toEqual(['duplicate', 'task-created']);
    expect(deps.persistence.createMonitoredTask).toHaveBeenCalledTimes(1);
  });
});
