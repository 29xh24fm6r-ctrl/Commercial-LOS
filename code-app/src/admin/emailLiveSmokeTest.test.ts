import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Office365OutlookService boundary so the @microsoft/power-
// apps SDK transitive import (via outlookEmailAdapters) is not loaded
// by this unit test. Most assertions inject a fake adapter via the
// deps argument anyway; this is belt-and-suspenders.
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));

import {
  runEmailLiveSmokeTest,
  EMAIL_LIVE_SMOKE_TEST_SUBJECT,
  EMAIL_LIVE_SMOKE_TEST_BODY,
} from './emailLiveSmokeTest';
import type {
  OutlookEmailInput,
  OutlookEmailPort,
  OutlookSendResult,
} from '../deals/emailDelivery/outlookEmailPort';

function adapterReturning(
  result: OutlookSendResult,
  mode: 'DRY_RUN' | 'LIVE' = 'DRY_RUN',
): OutlookEmailPort {
  return {
    mode,
    async send(_input: OutlookEmailInput) {
      return result;
    },
  };
}

function adapterCapturing(): {
  port: OutlookEmailPort;
  calls: OutlookEmailInput[];
} {
  const calls: OutlookEmailInput[] = [];
  return {
    port: {
      mode: 'LIVE',
      async send(input: OutlookEmailInput): Promise<OutlookSendResult> {
        calls.push(input);
        return { kind: 'accepted', providerMessageId: undefined };
      },
    },
    calls,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('Phase 109 — runEmailLiveSmokeTest pre-flight validation', () => {
  it('blocks the send when the recipient is empty', async () => {
    const adapter = adapterCapturing();
    const result = await runEmailLiveSmokeTest(
      { recipient: '' },
      { adapter: adapter.port },
    );
    expect(result.kind).toBe('invalid-input');
    expect(adapter.calls).toEqual([]);
  });

  it('blocks the send when the recipient is whitespace-only', async () => {
    const adapter = adapterCapturing();
    const result = await runEmailLiveSmokeTest(
      { recipient: '   ' },
      { adapter: adapter.port },
    );
    expect(result.kind).toBe('invalid-input');
    expect(adapter.calls).toEqual([]);
  });

  it('blocks the send when the recipient is malformed (fails isLikelyValidEmail)', async () => {
    const adapter = adapterCapturing();
    const result = await runEmailLiveSmokeTest(
      { recipient: 'not-an-email' },
      { adapter: adapter.port },
    );
    expect(result.kind).toBe('invalid-input');
    expect(adapter.calls).toEqual([]);
  });

  it('accepts a well-formed recipient and forwards to the adapter exactly once', async () => {
    const adapter = adapterCapturing();
    await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: adapter.port },
    );
    expect(adapter.calls.length).toBe(1);
  });
});

describe('Phase 109 — adapter call shape (no payload expansion)', () => {
  it('passes EXACTLY recipient / subject / body / correlationId to adapter.send', async () => {
    const adapter = adapterCapturing();
    await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: adapter.port },
    );
    const call = adapter.calls[0]!;
    expect(Object.keys(call).sort()).toEqual(
      ['body', 'correlationId', 'recipient', 'subject'].sort(),
    );
  });

  it('uses the hardcoded "OGB LOS Outlook smoke test" subject', async () => {
    const adapter = adapterCapturing();
    await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: adapter.port },
    );
    expect(adapter.calls[0]!.subject).toBe('OGB LOS Outlook smoke test');
    expect(adapter.calls[0]!.subject).toBe(EMAIL_LIVE_SMOKE_TEST_SUBJECT);
  });

  it('uses the hardcoded body that clearly identifies the message as a smoke test', async () => {
    const adapter = adapterCapturing();
    await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: adapter.port },
    );
    const body = adapter.calls[0]!.body;
    expect(body).toBe(EMAIL_LIVE_SMOKE_TEST_BODY);
    expect(body).toMatch(/smoke test/i);
    expect(body).toMatch(/Old Glory Bank/);
    expect(body).toMatch(/OGB LOS Admin Diagnostics/);
    // The body must NOT mention "borrower", "deal", "loan", or any
    // banker-workflow vocabulary — it should be obvious to anyone
    // reading the message that it's a diagnostic.
    expect(body).not.toMatch(/\bborrower\b/i);
    expect(body).not.toMatch(/\bdeal\b/i);
  });

  it('correlation id is a phase-109-smoke-* label so transport logs are filterable', async () => {
    const adapter = adapterCapturing();
    await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: adapter.port },
    );
    expect(adapter.calls[0]!.correlationId).toMatch(/^phase-109-smoke-/);
  });
});

describe('Phase 109 — outcome classification mirrors the existing adapter contract', () => {
  it('adapter accepted → kind: "accepted" with the adapter mode', async () => {
    const result = await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }, 'DRY_RUN') },
    );
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') expect(result.mode).toBe('DRY_RUN');
  });

  it('adapter accepted in LIVE → kind: "accepted" with mode LIVE', async () => {
    const result = await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: adapterReturning({ kind: 'accepted', providerMessageId: undefined }, 'LIVE') },
    );
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') expect(result.mode).toBe('LIVE');
  });

  it('adapter transient-failure → kind: "transient-failure"', async () => {
    const result = await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      {
        adapter: adapterReturning(
          { kind: 'transient-failure', reason: '503 backend unavailable' },
          'LIVE',
        ),
      },
    );
    expect(result.kind).toBe('transient-failure');
    if (result.kind === 'transient-failure') {
      expect(result.reason).toContain('503');
      expect(result.mode).toBe('LIVE');
    }
  });

  it('adapter permanent-failure → kind: "permanent-failure"', async () => {
    const result = await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      {
        adapter: adapterReturning(
          { kind: 'permanent-failure', reason: '403 forbidden' },
          'LIVE',
        ),
      },
    );
    expect(result.kind).toBe('permanent-failure');
    if (result.kind === 'permanent-failure') {
      expect(result.reason).toContain('403');
    }
  });

  it('adapter invalid-recipient → kind: "invalid-input" (folded; pre-flight should catch this anyway)', async () => {
    const result = await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      {
        adapter: adapterReturning(
          { kind: 'invalid-recipient', reason: 'rejected by transport' },
          'LIVE',
        ),
      },
    );
    expect(result.kind).toBe('invalid-input');
  });

  it('adapter throws → kind: "unknown" carrying the error message', async () => {
    const throwingAdapter: OutlookEmailPort = {
      mode: 'LIVE',
      async send(): Promise<OutlookSendResult> {
        throw new Error('connector handshake failed');
      },
    };
    const result = await runEmailLiveSmokeTest(
      { recipient: 'op@example.com' },
      { adapter: throwingAdapter },
    );
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.message).toContain('connector handshake failed');
    }
  });
});

describe('Phase 109 — conservative-copy discipline', () => {
  it('the hardcoded subject + body do NOT contain "delivered" / "email sent" / "borrower notified"', () => {
    expect(EMAIL_LIVE_SMOKE_TEST_SUBJECT).not.toMatch(/\bdelivered\b/i);
    expect(EMAIL_LIVE_SMOKE_TEST_BODY).not.toMatch(/\bdelivered\b/i);
    expect(EMAIL_LIVE_SMOKE_TEST_SUBJECT).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(EMAIL_LIVE_SMOKE_TEST_BODY).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(EMAIL_LIVE_SMOKE_TEST_BODY).not.toMatch(/\bborrower\s+notified\b/i);
  });
});
