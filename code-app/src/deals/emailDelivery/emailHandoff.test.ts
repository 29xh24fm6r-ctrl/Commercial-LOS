import { describe, it, expect } from 'vitest';
import {
  buildMailtoUrl,
  buildHandoffClipboardText,
} from './emailHandoff';

describe('Phase 63 — buildMailtoUrl', () => {
  it('builds a mailto: URL with encoded subject and body', () => {
    const url = buildMailtoUrl({
      recipient: 'borrower@example.com',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
    });
    expect(url).toBe(
      'mailto:borrower%40example.com?subject=Document%20request&body=Please%20share%20your%20most%20recent%20PFS.',
    );
  });

  it('encodes newlines in the body as %0A so multi-line bodies survive', () => {
    const url = buildMailtoUrl({
      recipient: 'borrower@example.com',
      subject: 'Documents needed',
      body: 'Line one.\nLine two.\n\nThanks.',
    });
    expect(url).toContain('%0A');
    // The encoded body must round-trip back to the original string.
    const params = new URL(url).searchParams;
    expect(params.get('body')).toBe('Line one.\nLine two.\n\nThanks.');
  });

  it('preserves & ? = # special characters in the body via encoding', () => {
    const body = 'Status: pending? Yes & confirmed = today # tag';
    const url = buildMailtoUrl({
      recipient: 'b@example.com',
      subject: 'Q',
      body,
    });
    // The raw '?' that separates recipient from query string is the
    // FIRST '?' in the URL. Subsequent encoded ones must be %3F.
    const firstQ = url.indexOf('?');
    const rest = url.slice(firstQ + 1);
    expect(rest).not.toContain('?');
    expect(rest).toContain('%3F');
    expect(rest).toContain('%26');
    expect(rest).toContain('%23');
    expect(rest).toContain('%3D');
    // Round-trip back through URLSearchParams to prove the body is
    // recoverable.
    const params = new URL(url).searchParams;
    expect(params.get('body')).toBe(body);
  });

  it('encodes the recipient (rare special chars in local-part)', () => {
    const url = buildMailtoUrl({
      recipient: 'first.last+tag@example.com',
      subject: 'Hi',
      body: 'Body',
    });
    // '+' must be encoded as %2B so the mail client doesn't read it
    // as a space.
    expect(url).toContain('first.last%2Btag%40example.com');
  });

  it('trims surrounding whitespace on recipient and subject', () => {
    const url = buildMailtoUrl({
      recipient: '  borrower@example.com  ',
      subject: '  Document request  ',
      body: 'Body',
    });
    expect(url).toBe(
      'mailto:borrower%40example.com?subject=Document%20request&body=Body',
    );
  });

  it('does NOT trim body — line breaks inside the body are semantic', () => {
    const url = buildMailtoUrl({
      recipient: 'b@e.com',
      subject: 's',
      body: '  leading + trailing whitespace  ',
    });
    const params = new URL(url).searchParams;
    expect(params.get('body')).toBe('  leading + trailing whitespace  ');
  });
});

describe('Phase 63 — buildHandoffClipboardText', () => {
  it('emits a four-section plain-text composition: To / Subject / blank / body', () => {
    const text = buildHandoffClipboardText({
      recipient: 'borrower@example.com',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
    });
    expect(text).toBe(
      'To: borrower@example.com\nSubject: Document request\n\nPlease share your most recent PFS.',
    );
  });

  it('preserves multi-line bodies verbatim', () => {
    const body = 'Line one.\nLine two.\n\nThanks.';
    const text = buildHandoffClipboardText({
      recipient: 'b@example.com',
      subject: 'Subj',
      body,
    });
    expect(text).toBe(`To: b@example.com\nSubject: Subj\n\n${body}`);
  });

  it('trims recipient and subject but preserves body whitespace', () => {
    const text = buildHandoffClipboardText({
      recipient: '  borrower@example.com  ',
      subject: '  Subj  ',
      body: '  body with leading and trailing spaces  ',
    });
    expect(text).toBe(
      'To: borrower@example.com\nSubject: Subj\n\n  body with leading and trailing spaces  ',
    );
  });

  it('does NOT include any "sent" / "delivered" wording (Phase 45 conservative-copy discipline)', () => {
    const text = buildHandoffClipboardText({
      recipient: 'b@example.com',
      subject: 'Document request',
      body: 'Body.',
    });
    // The clipboard text is what the banker pastes into Outlook. It
    // must NOT claim that anything was sent or delivered — the banker
    // is responsible for the actual send.
    expect(text).not.toMatch(/\bsent\b/i);
    expect(text).not.toMatch(/\bdelivered\b/i);
    expect(text).not.toMatch(/\bdispatched\b/i);
  });
});
