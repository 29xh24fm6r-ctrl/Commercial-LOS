import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import {
  GOVERNED_WRITES,
  LOCAL_ONLY_FLOWS,
  NOT_WIRED,
} from './platformInventory';

/**
 * Phase 110 — Communication lane final release lock.
 *
 * This file is the consolidated CI-time evidence that the
 * Phase 104–109 banker-triggered Outlook communication lane is
 * release-locked. No production code change ships with Phase 110;
 * this test file + the Phase 110 doc are the entire deliverable.
 *
 * Where earlier per-phase pins each watched a specific file or
 * boundary, Phase 110 BROADENS those pins across the full
 * communication-lane file set and across all production source.
 * If a future change drifts ANY boundary captured below, the
 * relevant block fails with an operator-readable error.
 *
 * Earlier per-phase pins (still active alongside this file):
 *   - Phase 106 (`emailLiveReleaseReadiness.test.ts`):
 *     connector boundary, payload shape on the LIVE adapter,
 *     Phase 101 handoff isolation.
 *   - Phase 107 (`communicationActivityLedger.test.ts`):
 *     audit/timeline shape consistency across the two writes.
 *   - Phase 108 (`borrowerUpdateRefresh.test.tsx`):
 *     refresh-key wiring + static-source pin for
 *     `BorrowerCommunication.tsx`.
 *
 * Canonical references:
 *   - docs/PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md
 *   - docs/PHASE_104_OUTLOOK_LIVE_SEND.md
 *   - docs/PHASE_105_BORROWER_UPDATE_LIVE_SEND.md
 *   - docs/PHASE_106_EMAIL_MODE_RELEASE_READINESS.md
 *   - docs/PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md
 *   - docs/PHASE_108_BORROWER_UPDATE_REFRESH.md
 *   - docs/PHASE_109_EMAIL_LIVE_SMOKE_TEST.md
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function relForward(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/');
}

/**
 * Strips block + line comments. Necessary because production-source
 * files legitimately mention "delivered" / "SendEmailV2" / etc. in
 * JSDoc and inline comments while their CODE remains honest. Phase
 * 106 + 107 use this same strip pattern. Markdown files are not
 * scanned.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function collectProductionSourceFiles(dirAbs: string, out: string[]): void {
  for (const entry of readdirSync(dirAbs)) {
    const abs = resolve(dirAbs, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      if (relForward(abs).endsWith('src/generated')) continue;
      collectProductionSourceFiles(abs, out);
    } else if (
      stat.isFile() &&
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      out.push(abs);
    }
  }
}

const PRODUCTION_SOURCE_FILES: readonly string[] = (() => {
  const out: string[] = [];
  collectProductionSourceFiles(resolve(REPO_ROOT, 'src'), out);
  return out;
})();

/**
 * The communication-lane file set. These are the files whose
 * source is involved in the banker-triggered Outlook email
 * workflow shipped across Phase 104–109. Phase 110's tighter
 * wording + payload-field pins apply specifically to this list;
 * the broader scope-creep pins apply to all production source.
 */
const COMMUNICATION_LANE_FILES: readonly string[] = [
  'src/deals/sendDocumentRequestEmail.ts',
  'src/deals/sendBorrowerUpdateEmail.ts',
  'src/deals/BorrowerCommunication.tsx',
  'src/deals/RequestDocumentModal.tsx',
  'src/deals/DraftBorrowerUpdateModal.tsx',
  'src/deals/emailDelivery/outlookEmailAdapters.ts',
  'src/admin/emailLiveSmokeTest.ts',
  'src/admin/EmailLiveDiagnostics.tsx',
];

// ---------------------------------------------------------------------------
// Block 1 — Inventory state at release (data-layer)
//
// Re-asserts the inventory shape Phase 104–109 left in place. If
// any of these moves, the release lock is broken and the operator
// promotion checklist should be reread.
// ---------------------------------------------------------------------------

describe('Phase 110 — Inventory state at release', () => {
  it('GOVERNED_WRITES count is exactly 13 after Phase 160 added deal-log-activity', () => {
    expect(GOVERNED_WRITES.length).toBe(13);
  });

  it('exactly two governed writes are borrower/deal Outlook email sends', () => {
    const emailWrites = GOVERNED_WRITES.filter((w) => w.id.endsWith('-email'));
    const ids = emailWrites.map((w) => w.id).sort();
    expect(ids).toEqual(
      ['deal-borrower-update-email', 'deal-document-request-email'].sort(),
    );
  });

  it('NOT_WIRED.email-delivery is absent (Phase 105 retired it; Phase 106/107/110 keep it absent)', () => {
    const entry = NOT_WIRED.find((n) => n.id === 'email-delivery');
    expect(entry).toBeUndefined();
  });

  it('NOT_WIRED.outlook-connector-live-send is absent (Phase 104 retired it)', () => {
    const entry = NOT_WIRED.find((n) => n.id === 'outlook-connector-live-send');
    expect(entry).toBeUndefined();
  });

  it('the borrower-portal compound NOT_WIRED entry honestly acknowledges Phase 104 + Phase 105 while pinning what is still missing', () => {
    const bp = NOT_WIRED.find((n) => n.id === 'borrower-portal');
    expect(bp).toBeDefined();
    expect(bp!.blockerKind).toBe('compound');
    // Phase 104 mentioned as a closed lane.
    expect(bp!.reason).toMatch(/Phase\s+104.*document-request/i);
    // Phase 105 mentioned as a closed lane.
    expect(bp!.reason).toMatch(/Phase\s+105.*borrower[\s-]+update/i);
    // Automation / inbound / event-push gaps remain open and named.
    expect(bp!.reason).toMatch(/no\s+automation/i);
    expect(bp!.reason).toMatch(/no\s+scheduled\s+trigger/i);
    expect(bp!.reason).toMatch(/no\s+event[-\s]driven\s+push/i);
    expect(bp!.reason).toMatch(/no\s+inbound[-\s]mail\s+sync/i);
  });

  it('LOCAL_ONLY_FLOWS.outlook-summary-handoff (Phase 101) is still copy-to-clipboard regardless of EMAIL_MODE', () => {
    const entry = LOCAL_ONLY_FLOWS.find(
      (f) => f.id === 'outlook-summary-handoff',
    );
    expect(entry).toBeDefined();
    expect(entry!.note).toMatch(/copy-to-clipboard/i);
    expect(entry!.note).toMatch(/regardless of EMAIL_MODE/i);
  });
});

// ---------------------------------------------------------------------------
// Block 2 — Outlook connector boundary at release (static-source)
//
// Restates the Phase 106 + 109 connector-boundary pin in this
// consolidated file so a future drift fails THIS test with a clear
// "release lock broken" signal.
// ---------------------------------------------------------------------------

describe('Phase 110 — Outlook connector boundary is exactly one import + one SendEmailV2 callsite', () => {
  it('exactly one production source file imports Office365OutlookService', () => {
    const matches: string[] = [];
    for (const abs of PRODUCTION_SOURCE_FILES) {
      const rel = relForward(abs);
      const src = readFileSync(abs, 'utf8');
      if (/from\s+['"][^'"]*Office365OutlookService['"]/.test(src)) {
        matches.push(rel);
      }
    }
    expect(matches).toEqual([
      'src/deals/emailDelivery/outlookEmailAdapters.ts',
    ]);
  });

  it('exactly one production source file calls Office365OutlookService.SendEmailV2 in CODE (comments stripped)', () => {
    const matches: string[] = [];
    for (const abs of PRODUCTION_SOURCE_FILES) {
      const rel = relForward(abs);
      const src = stripComments(readFileSync(abs, 'utf8'));
      if (/Office365OutlookService\.SendEmailV2\s*\(/.test(src)) {
        matches.push(rel);
      }
    }
    expect(matches).toEqual([
      'src/deals/emailDelivery/outlookEmailAdapters.ts',
    ]);
  });

  it('getEmailAdapter() consumers are exactly the three expected files at release', () => {
    const callers: string[] = [];
    for (const abs of PRODUCTION_SOURCE_FILES) {
      const rel = relForward(abs);
      // The adapter file itself DEFINES the function; only count callers.
      if (rel === 'src/deals/emailDelivery/outlookEmailAdapters.ts') continue;
      const src = readFileSync(abs, 'utf8');
      if (/\bgetEmailAdapter\s*\(/.test(src)) callers.push(rel);
    }
    expect(callers.sort()).toEqual(
      [
        'src/admin/emailLiveSmokeTest.ts',
        'src/deals/sendBorrowerUpdateEmail.ts',
        'src/deals/sendDocumentRequestEmail.ts',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Block 3 — Modal layer does not breach the adapter boundary
//
// The Phase 23 / 61 / 105 modals (and the BorrowerCommunication
// container card) must NOT import Office365OutlookService or call
// getEmailAdapter() / liveAdapter directly. Their contract is to
// receive an action callback as a prop. This was implicit before
// Phase 110; it is now load-bearing in case a future refactor is
// tempted to short-circuit the action layer.
// ---------------------------------------------------------------------------

describe('Phase 110 — Modal/container layer does not breach the adapter boundary', () => {
  const MODAL_LAYER_FILES = [
    'src/deals/BorrowerCommunication.tsx',
    'src/deals/RequestDocumentModal.tsx',
    'src/deals/DraftBorrowerUpdateModal.tsx',
  ] as const;

  for (const rel of MODAL_LAYER_FILES) {
    it(`${rel} does NOT import Office365OutlookService`, () => {
      const src = readSource(rel);
      expect(src).not.toMatch(
        /from\s+['"][^'"]*Office365OutlookService['"]/,
      );
    });

    it(`${rel} does NOT call getEmailAdapter() in CODE`, () => {
      const src = stripComments(readSource(rel));
      expect(/\bgetEmailAdapter\s*\(/.test(src)).toBe(false);
    });

    it(`${rel} does NOT reference liveAdapter directly in CODE`, () => {
      const src = stripComments(readSource(rel));
      // The modal layer must not bypass the port abstraction by
      // grabbing the LIVE adapter export by name.
      expect(/\bliveAdapter\b/.test(src)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Block 4 — Admin smoke test is isolated from Dataverse
//
// The Phase 109 operator smoke test must NOT import any Cr664_*
// service. The smoke send produces zero audit, timeline, or
// Dataverse mutation. Same applies to the diagnostics card that
// hosts the smoke form.
// ---------------------------------------------------------------------------

describe('Phase 110 — Admin smoke test is isolated from Dataverse', () => {
  const ADMIN_SMOKE_FILES = [
    'src/admin/emailLiveSmokeTest.ts',
    'src/admin/EmailLiveDiagnostics.tsx',
  ] as const;

  for (const rel of ADMIN_SMOKE_FILES) {
    it(`${rel} does NOT import any Cr664_* generated service`, () => {
      const src = readSource(rel);
      // Match any `from '.../Cr664_<lowercase>service'` import.
      expect(src).not.toMatch(
        /from\s+['"][^'"]*Cr664_[a-z]+service['"]/i,
      );
    });

    it(`${rel} does NOT import the audit-enum or timeline-enum modules either (no governed-write coordination at all)`, () => {
      const src = readSource(rel);
      expect(src).not.toMatch(/from\s+['"][^'"]*auditEnums['"]/);
      expect(src).not.toMatch(/from\s+['"][^'"]*timelineEnums['"]/);
    });

    it(`${rel} does NOT import the correlationId helper (the smoke test produces no governed-write correlation row)`, () => {
      const src = readSource(rel);
      expect(src).not.toMatch(/from\s+['"][^'"]*correlationId['"]/);
    });
  }
});

// ---------------------------------------------------------------------------
// Block 5 — No payload-field expansion across the communication lane
//
// The LIVE adapter sets exactly { To, Subject, Body, Importance }.
// No file in the communication lane may introduce a forbidden
// field name as a payload key — that includes the modal layer
// (which builds the action's input shape) and the smoke test
// (which builds the adapter's input shape). Comments stripped so
// doc text discussing what's NOT included doesn't trip the pin.
// ---------------------------------------------------------------------------

describe('Phase 110 — No payload-field expansion across the communication lane', () => {
  const FORBIDDEN_PAYLOAD_FIELDS = [
    'Attachments',
    'Cc',
    'Bcc',
    'From',
    'ReplyTo',
    'Sensitivity',
  ] as const;

  for (const rel of COMMUNICATION_LANE_FILES) {
    for (const field of FORBIDDEN_PAYLOAD_FIELDS) {
      it(`${rel} sets no '${field}' payload field in CODE`, () => {
        const src = stripComments(readSource(rel));
        const pattern = new RegExp(`\\b${field}\\b\\s*:`);
        expect(pattern.test(src)).toBe(false);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Block 6 — No out-of-scope behavior anywhere in production source
//
// Phase 110 broadens the Phase 106 + 107 "no automation / inbound /
// portal / etc." scans from the action files to ALL production
// source. The brief explicitly forbids each of these surfaces from
// being introduced anywhere in this release.
// ---------------------------------------------------------------------------

describe('Phase 110 — No out-of-scope behavior anywhere in production source', () => {
  const FORBIDDEN_CODE_PATTERNS: readonly { name: string; re: RegExp }[] = [
    { name: 'shared mailbox', re: /\b(sharedMailbox|SendEmailFromShared(?:Mailbox)?)\b/i },
    { name: 'Graph generic client', re: /\b(microsoftGraph|GraphClient|MicrosoftGraphClient)\b/ },
    { name: 'calendar send / event create / meeting create', re: /\b(CalendarEvent|CalendarEvents|CreateMeeting|OnlineMeeting)\b/ },
    { name: 'inbound mail sync', re: /\b(OnNewEmail|MailboxSubscription|GetEmails(?:V[0-9]+)?|GetMailTips)\b/ },
    { name: 'subscription / webhook / event push', re: /\b(SubscribeMailbox|SubscribeEmailUpdate|subscribeWebhook|registerWebhook)\b/i },
    { name: 'scheduled / automated email send', re: /\b(new\s+CronJob|schedule\.scheduleJob)\b/ },
    { name: 'scheduled send invoking the action functions', re: /\b(setInterval|setTimeout)\s*\([^)]*send(?:Document|Borrower)/i },
    { name: 'delivery / read tracking', re: /\b(deliveryReceipt|readReceipt|trackDelivery|messageDelivered|messageRead)\b/i },
  ];

  for (const { name, re } of FORBIDDEN_CODE_PATTERNS) {
    it(`no production source contains ${name}`, () => {
      const violations: string[] = [];
      for (const abs of PRODUCTION_SOURCE_FILES) {
        const rel = relForward(abs);
        const src = stripComments(readFileSync(abs, 'utf8'));
        if (re.test(src)) violations.push(`${rel}: ${re}`);
      }
      expect(violations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Block 7 — User-facing wording discipline across the communication lane
//
// Forbidden phrases must not appear in CODE (comments stripped) of
// the communication-lane files. Each pattern is a precise phrase —
// the bare word `delivered` is forbidden specifically because the
// only legitimate uses in the communication lane are negations in
// doc comments (which are stripped) and the precise forbidden
// claim itself.
//
// False-positive handling (narrow + documented):
//   - "delivery confirmation" appears in honest negations
//     ("connector acceptance, not borrower delivery confirmation").
//     The bare word "delivery" is NOT forbidden by this block; only
//     "delivered" is.
//   - "EmailLogged" / "BorrowerUpdateSent" enum names contain "Sent"
//     but are not banker-facing wording; this block does not match
//     the bare word "sent". Only precise phrases.
// ---------------------------------------------------------------------------

describe('Phase 110 — User-facing wording discipline across the communication lane', () => {
  const FORBIDDEN_WORDING: readonly { name: string; re: RegExp }[] = [
    { name: '"delivered" (verb) — communication lane', re: /\bdelivered\b/i },
    { name: '"email delivered" phrase', re: /\bemail\s+delivered\b/i },
    { name: '"email was/has been sent"', re: /\bemail\s+(?:was|has\s+been)\s+sent\b/i },
    { name: '"sent successfully"', re: /\bsent\s+successfully\b/i },
    { name: '"borrower was/has been notified"', re: /\bborrower\s+(?:was|has\s+been)\s+notified\b/i },
  ];

  for (const rel of COMMUNICATION_LANE_FILES) {
    for (const { name, re } of FORBIDDEN_WORDING) {
      it(`${rel} contains no ${name} claim in CODE`, () => {
        const src = stripComments(readSource(rel));
        expect(re.test(src)).toBe(false);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Block 8 — Phase 101 summary handoffs stay out of the connector path
//
// Restated from Phase 106 to make the release-lock evidence
// self-contained. The four Phase 101 surfaces (helper + button
// file + four consumer files) MUST NOT touch the connector
// regardless of EMAIL_MODE.
// ---------------------------------------------------------------------------

describe('Phase 110 — Phase 101 summary handoffs remain copy-to-clipboard, regardless of EMAIL_MODE', () => {
  const PHASE_101_FILES: readonly string[] = [
    'src/shared/email/summaryOutlookHandoff.ts',
    'src/shared/email/SummaryOutlookHandoffButtons.tsx',
    'src/banker/BankerMorningCatchUp.tsx',
    'src/manager/ManagerMorningCatchUp.tsx',
    'src/deals/ActivityTimeline.tsx',
    'src/banker/RelationshipMemory.tsx',
  ];

  for (const rel of PHASE_101_FILES) {
    it(`${rel} does NOT import Office365OutlookService / getEmailAdapter / liveAdapter`, () => {
      const src = readSource(rel);
      expect(src).not.toMatch(
        /from\s+['"][^'"]*Office365OutlookService['"]/,
      );
      const stripped = stripComments(src);
      expect(stripped).not.toMatch(/\bgetEmailAdapter\s*\(/);
      expect(stripped).not.toMatch(/\bliveAdapter\b/);
    });
  }
});

// ---------------------------------------------------------------------------
// Block 9 — Release-lock sanity check: every communication-lane
// file actually exists on disk.
//
// Defensive — catches a future refactor that renames or deletes
// any of the lane files without updating this list.
// ---------------------------------------------------------------------------

describe('Phase 110 — Communication-lane files all exist on disk', () => {
  for (const rel of COMMUNICATION_LANE_FILES) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});
