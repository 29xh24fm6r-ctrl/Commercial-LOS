import { describe, it, expect } from 'vitest';
import {
  dryRunAdapter,
  liveAdapter,
  isLikelyValidEmail,
} from './outlookEmailAdapters';

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
    // Pathological inputs route to invalid-recipient, never an exception.
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

describe('Phase 61 — liveAdapter', () => {
  it('discriminator field is "LIVE"', () => {
    expect(liveAdapter.mode).toBe('LIVE');
  });

  it('returns kind: "permanent-failure" with a clear "connector not yet registered" reason', async () => {
    const r = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('permanent-failure');
    if (r.kind === 'permanent-failure') {
      expect(r.reason).toMatch(/Office 365 Outlook connector/i);
      expect(r.reason).toMatch(/not yet registered/i);
    }
  });

  it('still validates the recipient before reporting the connector gap', async () => {
    const r = await liveAdapter.send({
      recipient: 'not-an-email',
      subject: 's',
      body: 'b',
      correlationId: 'abc',
    });
    expect(r.kind).toBe('invalid-recipient');
  });
});
