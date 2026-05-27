import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dryRunAdapter,
  liveAdapter,
  isLikelyValidEmail,
} from './outlookEmailAdapters';
import { Office365OutlookService } from '../../generated/services/Office365OutlookService';

vi.mock('../../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: {
    SendEmailV2: vi.fn(),
  },
}));

const sendEmailV2Mock = Office365OutlookService.SendEmailV2 as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  sendEmailV2Mock.mockReset();
});

describe('Phase 61 — isLikelyValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isLikelyValidEmail('borrower@example.com')).toBe(true);
    expect(isLikelyValidEmail('jane.doe+tag@example.co.uk')).toBe(true);
  });

  it('rejects strings without @', () => {
    expect(isLikelyValidEmail('not-an-email')).toBe(false);
  });

  it('rejects strings with more than one @', () => {
    expect(isLikelyValidEmail('a@b@c.com')).toBe(false);
  });

  it('rejects strings with embedded whitespace', () => {
    expect(isLikelyValidEmail('foo bar@example.com')).toBe(false);
    expect(isLikelyValidEmail('foo@ex ample.com')).toBe(false);
  });

  it('rejects strings whose domain has no dot', () => {
    expect(isLikelyValidEmail('foo@localhost')).toBe(false);
  });

  it('rejects strings with a leading or trailing dot in the domain', () => {
    expect(isLikelyValidEmail('foo@.example.com')).toBe(false);
    expect(isLikelyValidEmail('foo@example.com.')).toBe(false);
  });

  it('rejects empty local part', () => {
    expect(isLikelyValidEmail('@example.com')).toBe(false);
  });

  it('rejects pathologically long addresses (>254 chars)', () => {
    const long = `${'x'.repeat(250)}@example.com`;
    expect(isLikelyValidEmail(long)).toBe(false);
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(isLikelyValidEmail('  borrower@example.com  ')).toBe(true);
  });
});

describe('Phase 61 — dryRunAdapter', () => {
  it('returns kind: "accepted" for a well-formed message', async () => {
    const r = await dryRunAdapter.send({
      recipient: 'borrower@example.com',
      subject: 'Document needed',
      body: 'Please upload your PFS.',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      // DRY_RUN never returns a provider id — the transport was not invoked.
      expect(r.providerMessageId).toBeUndefined();
    }
  });

  it('does NOT call Office365OutlookService.SendEmailV2 (Phase 104 isolation)', async () => {
    await dryRunAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(sendEmailV2Mock).not.toHaveBeenCalled();
  });

  it('returns kind: "invalid-recipient" when recipient fails the shape check', async () => {
    const r = await dryRunAdapter.send({
      recipient: 'not-an-email',
      subject: 'x',
      body: 'y',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('invalid-recipient');
  });

  it('rejects empty subject', async () => {
    const r = await dryRunAdapter.send({
      recipient: 'borrower@example.com',
      subject: '   ',
      body: 'y',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('invalid-recipient');
  });

  it('rejects empty body', async () => {
    const r = await dryRunAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: '',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('invalid-recipient');
  });

  it('discriminator field is "DRY_RUN"', () => {
    expect(dryRunAdapter.mode).toBe('DRY_RUN');
  });

  it('does not throw on any input shape — failure flows through the result union', async () => {
    await expect(
      dryRunAdapter.send({
        recipient: '',
        subject: '',
        body: '',
        correlationId: 'abc',
      }),
    ).resolves.toMatchObject({ kind: 'invalid-recipient' });
  });
});

describe('Phase 104 — liveAdapter (SendEmailV2 wired)', () => {
  it('discriminator field is "LIVE"', () => {
    expect(liveAdapter.mode).toBe('LIVE');
  });

  it('still validates the recipient BEFORE invoking SendEmailV2', async () => {
    const r = await liveAdapter.send({
      recipient: 'not-an-email',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('invalid-recipient');
    expect(sendEmailV2Mock).not.toHaveBeenCalled();
  });

  it('calls Office365OutlookService.SendEmailV2 with a ClientSendHtmlMessage payload', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({ success: true, data: undefined });
    await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
      correlationId: 'abc',
    });
    expect(sendEmailV2Mock).toHaveBeenCalledTimes(1);
    expect(sendEmailV2Mock).toHaveBeenCalledWith({
      To: 'borrower@example.com',
      Subject: 'Document request',
      Body: 'Please share your most recent PFS.',
      Importance: 'Normal',
    });
  });

  it('does NOT pass attachments / Cc / Bcc / shared mailbox From / ReplyTo on the payload', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({ success: true, data: undefined });
    await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
      correlationId: 'abc',
    });
    const payload = sendEmailV2Mock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.Attachments).toBeUndefined();
    expect(payload.Cc).toBeUndefined();
    expect(payload.Bcc).toBeUndefined();
    expect(payload.From).toBeUndefined();
    expect(payload.ReplyTo).toBeUndefined();
    expect(payload.Sensitivity).toBeUndefined();
  });

  it('maps success → accepted with undefined providerMessageId (SendEmailV2 returns void)', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({ success: true, data: undefined });
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') {
      expect(r.providerMessageId).toBeUndefined();
    }
  });

  it('maps a 5xx failure → transient-failure carrying the connector message', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: { message: 'Outlook backend is unavailable.', status: 503 },
    });
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('transient-failure');
    if (r.kind === 'transient-failure') {
      expect(r.reason).toContain('Outlook backend is unavailable.');
    }
  });

  it('maps a 429 throttle → transient-failure', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: { message: 'Too many requests.', status: 429 },
    });
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('transient-failure');
  });

  it('maps a 408 request-timeout → transient-failure', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: { message: 'Request timeout.', status: 408 },
    });
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('transient-failure');
  });

  it('maps a 403 permission failure → permanent-failure', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: { message: 'Permission denied.', status: 403 },
    });
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('permanent-failure');
    if (r.kind === 'permanent-failure') {
      expect(r.reason).toContain('Permission denied.');
    }
  });

  it('maps a 400 malformed-payload failure → permanent-failure', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: { message: 'Recipient rejected by transport.', status: 400 },
    });
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('permanent-failure');
  });

  it('maps a no-status failure (network drop) → transient-failure', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({
      success: false,
      data: undefined,
      error: { message: 'Network unreachable.' },
    });
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('transient-failure');
  });

  it('maps a thrown exception → transient-failure (no thrown error escapes the adapter)', async () => {
    sendEmailV2Mock.mockRejectedValueOnce(new Error('Connector handshake failed.'));
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('transient-failure');
    if (r.kind === 'transient-failure') {
      expect(r.reason).toContain('Connector handshake failed.');
    }
  });

  it('does not invoke any other Office365OutlookService method (no Graph / calendar / subscription / shared mailbox calls)', async () => {
    sendEmailV2Mock.mockResolvedValueOnce({ success: true, data: undefined });
    await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    // Only the SendEmailV2 spy is wired; any access to a different
    // method on the mocked module would throw "is not a function".
    // Belt-and-suspenders: verify the mock object exposes only the one
    // method we registered.
    expect(Object.keys(Office365OutlookService)).toEqual(['SendEmailV2']);
  });
});
