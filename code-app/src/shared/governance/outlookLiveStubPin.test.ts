import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dryRunAdapter,
  liveAdapter,
} from '../../deals/emailDelivery/outlookEmailAdapters';
import { GOVERNED_WRITES, NOT_WIRED } from './platformInventory';

/**
 * Phase 62 regression pin — Outlook LIVE adapter is honestly stubbed.
 *
 * The Office 365 Outlook connector has not been registered for this
 * Code App. Phase 61 shipped the full DRY_RUN + LIVE-stub scaffolding;
 * Phase 62 verified the state and added this trip-wire so any
 * accidental / half implementation gets a loud signal at CI time.
 *
 * When the connector lands upstream and the typed swap completes (see
 * docs/PHASE_62_OUTLOOK_LIVE_SEND.md §2), DELETE this entire test file
 * in the same commit. Until then it guards five overlapping invariants:
 *
 *   1. liveAdapter still returns permanent-failure on a valid recipient
 *      (no silent flip to a real send).
 *   2. The "connector not yet registered" reason text is preserved
 *      verbatim (banker-facing copy + audit notes consume this).
 *   3. The swap-comment block in outlookEmailAdapters.ts is still
 *      present (anchor for the eventual one-line replacement).
 *   4. No Office365 / email / outlook service file has appeared in
 *      src/generated/services/ (the upstream blocker is still in
 *      place; if this fails, run the Phase 62 §2 swap).
 *   5. The Phase 61 governance metadata is unchanged: the governed
 *      write is shipped, the connector NOT_WIRED entry is still
 *      present.
 *
 * No production code change ships with Phase 62. The doc and this
 * test are the entire deliverable.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const EXPECTED_REASON_FRAGMENTS = [
  'Office 365 Outlook connector is not yet registered',
  'LIVE mode is wired end-to-end',
  'connector registration + SDK regeneration',
  'docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md',
];

// ---------------------------------------------------------------------------
// 1. Adapter behavior — LIVE still stubbed, DRY_RUN still works
// ---------------------------------------------------------------------------

describe('Phase 62 — liveAdapter is still honestly stubbed', () => {
  it('returns kind: permanent-failure on a valid recipient', async () => {
    const result = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
      correlationId: 'oe-test',
    });
    expect(result.kind).toBe('permanent-failure');
  });

  it('the failure reason carries every documented fragment so audit notes stay precise', async () => {
    const result = await liveAdapter.send({
      recipient: 'borrower@example.com',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
      correlationId: 'oe-test',
    });
    if (result.kind !== 'permanent-failure') {
      throw new Error(`expected permanent-failure, got ${result.kind}`);
    }
    for (const fragment of EXPECTED_REASON_FRAGMENTS) {
      expect(
        result.reason,
        `reason missing fragment: ${fragment}`,
      ).toContain(fragment);
    }
  });

  it('the pre-flight invalid-recipient check still runs ahead of the stub failure', async () => {
    const result = await liveAdapter.send({
      recipient: 'not-an-email',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
      correlationId: 'oe-test',
    });
    // The pre-flight check returns invalid-recipient BEFORE the
    // permanent-failure path; this verifies the order of operations
    // matches the Phase 61 contract.
    expect(result.kind).toBe('invalid-recipient');
  });

  it('liveAdapter advertises mode: LIVE so the modal can render the badge', () => {
    expect(liveAdapter.mode).toBe('LIVE');
  });

  it('dryRunAdapter advertises mode: DRY_RUN and still accepts valid input', async () => {
    expect(dryRunAdapter.mode).toBe('DRY_RUN');
    const result = await dryRunAdapter.send({
      recipient: 'borrower@example.com',
      subject: 'Document request',
      body: 'Please share your most recent PFS.',
      correlationId: 'oe-test',
    });
    expect(result.kind).toBe('accepted');
  });
});

// ---------------------------------------------------------------------------
// 2. Swap-comment anchor — the inline replacement-block must remain
// ---------------------------------------------------------------------------

describe('Phase 62 — outlookEmailAdapters preserves the swap-comment anchor', () => {
  it('contains the Office365EmailService import-and-call comment block', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'src/deals/emailDelivery/outlookEmailAdapters.ts'),
      'utf8',
    );
    // These three fragments together pin the swap-comment block.
    // When the swap actually lands, ALL THREE disappear — that's the
    // signal that this regression pin should be deleted.
    expect(src).toContain('PHASE 61 LIVE STUB');
    expect(src).toContain("'../../generated/services/Office365EmailService'");
    expect(src).toContain('sendEmailV2');
  });

  it('the LIVE_CONNECTOR_NOT_REGISTERED constant references the Phase 61 unblock doc', () => {
    const src = readFileSync(
      resolve(REPO_ROOT, 'src/deals/emailDelivery/outlookEmailAdapters.ts'),
      'utf8',
    );
    expect(src).toMatch(
      /LIVE_CONNECTOR_NOT_REGISTERED\s*=\s*[\s\S]*PHASE_61_OUTLOOK_EMAIL_DELIVERY\.md/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Upstream blocker — no Office365 service file has appeared
// ---------------------------------------------------------------------------

describe('Phase 62 — upstream Office365 connector is still absent', () => {
  it('src/generated/services/ contains no Office365* / Outlook* / *EmailService file', () => {
    const dir = resolve(REPO_ROOT, 'src/generated/services');
    const entries = readdirSync(dir);
    const matches = entries.filter((n) =>
      /(?:office365|outlook|sendmail|emailservice)/i.test(n),
    );
    // If this fails, the connector has been registered + the SDK
    // regenerated. Time to run the Phase 62 §2 swap and DELETE this
    // entire test file.
    expect(
      matches,
      `Office365-like service files appeared in src/generated/services/: ` +
        `${matches.join(', ')}. ` +
        `The Outlook connector seems to have landed upstream — run the ` +
        `Phase 62 swap (see docs/PHASE_62_OUTLOOK_LIVE_SEND.md §2) and ` +
        `delete this regression-pin file.`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Governance metadata still aligned (Phase 61 didn't regress)
// ---------------------------------------------------------------------------

describe('Phase 62 — Phase 61 governance metadata is unchanged', () => {
  it('GOVERNED_WRITES still contains deal-document-request-email (Phase 61)', () => {
    const entry = GOVERNED_WRITES.find(
      (w) => w.id === 'deal-document-request-email',
    );
    expect(entry).toBeDefined();
    expect(entry!.phase).toBe(61);
    expect(entry!.emitsAudit).toBe(true);
    expect(entry!.emitsTimeline).toBe(true);
  });

  it('NOT_WIRED still contains outlook-connector-live-send (the upstream blocker)', () => {
    const entry = NOT_WIRED.find(
      (n) => n.id === 'outlook-connector-live-send',
    );
    expect(entry).toBeDefined();
  });
});
