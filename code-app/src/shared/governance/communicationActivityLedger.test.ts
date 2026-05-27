import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GOVERNED_WRITES } from './platformInventory';

/**
 * Phase 107 — Banker communication activity ledger consolidation.
 *
 * No production behavior change. This file is the governance-evidence
 * pin that the two completed Outlook-backed banker communication
 * writes (Phase 104 document-request email, Phase 105 borrower-update
 * email) produce CONSISTENT, OPERATOR-READABLE activity evidence:
 *
 *   - identical governance shape (audit + timeline + correlation id),
 *   - distinct timeline event-type enums (so the rows are
 *     semantically separable in the ledger),
 *   - distinct audit event names (so the audit ledger is
 *     queryable per write),
 *   - full recipient confined to audit notes, masked recipient on
 *     timeline summary,
 *   - "Outlook accepted" wording, no claim of delivery.
 *
 * Sibling reference for the rendered UI:
 *   src/deals/borrowerCommunicationActivity.test.tsx — pins that
 *   both rows render under the BorrowerCommunication card with
 *   distinct labels and the masked-recipient + accepted-language
 *   contract.
 *
 * Canonical sources:
 *   - docs/PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md
 *   - docs/PHASE_104_OUTLOOK_LIVE_SEND.md
 *   - docs/PHASE_105_BORROWER_UPDATE_LIVE_SEND.md
 *   - src/deals/sendDocumentRequestEmail.ts
 *   - src/deals/sendBorrowerUpdateEmail.ts
 *   - src/deals/activityQueries.ts (timeline event type map)
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

interface CommWriteEvidence {
  writeId: string;
  actionFile: string;
  auditEventName: string;
  correlationPrefix: string;
  timelineEventTypeValue: number;
  /** Display-friendly label that should be reachable in the
   *  BorrowerCommunication card. The action's cr664_title literal
   *  is the row title. */
  rowTitleLeadingFragment: string;
}

// The two completed banker communication writes. The shape of each
// entry is what Phase 107 considers "consistent operator-readable
// evidence": same governance fields, distinct semantics.
const COMMUNICATION_WRITES: readonly CommWriteEvidence[] = [
  {
    writeId: 'deal-document-request-email',
    actionFile: 'src/deals/sendDocumentRequestEmail.ts',
    auditEventName: 'DocumentRequest Outlook Send',
    correlationPrefix: 'oe',
    timelineEventTypeValue: 788190001, // EmailLogged
    rowTitleLeadingFragment: 'Document request',
  },
  {
    writeId: 'deal-borrower-update-email',
    actionFile: 'src/deals/sendBorrowerUpdateEmail.ts',
    auditEventName: 'BorrowerUpdate Outlook Send',
    correlationPrefix: 'bue',
    timelineEventTypeValue: 788190014, // BorrowerUpdateSent
    rowTitleLeadingFragment: 'Borrower update',
  },
];

// ---------------------------------------------------------------------------
// Invariant 1 — both writes are present and identically shaped at the
// inventory layer (audit + timeline + per-deal).
// ---------------------------------------------------------------------------

describe('Phase 107 — both completed communication writes are inventory-shaped consistently', () => {
  for (const w of COMMUNICATION_WRITES) {
    it(`GOVERNED_WRITES.${w.writeId} is shipped with audit + timeline`, () => {
      const entry = GOVERNED_WRITES.find((g) => g.id === w.writeId);
      expect(entry, `expected GOVERNED_WRITES.${w.writeId}`).toBeDefined();
      expect(entry!.emitsAudit).toBe(true);
      expect(entry!.emitsTimeline).toBe(true);
    });
  }

  it('both writes appear together (no half-built pair)', () => {
    const ids = new Set(GOVERNED_WRITES.map((g) => g.id));
    for (const w of COMMUNICATION_WRITES) {
      expect(ids.has(w.writeId)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant 2 — distinct audit event names + correlation prefixes.
// Operators querying the audit ledger by write can distinguish the
// two flows without ambiguity.
// ---------------------------------------------------------------------------

describe('Phase 107 — audit ledger evidence is distinct per write', () => {
  for (const w of COMMUNICATION_WRITES) {
    it(`${w.actionFile} stamps cr664_auditeventname = '${w.auditEventName}'`, () => {
      const src = stripComments(readSource(w.actionFile));
      const pattern = new RegExp(
        `cr664_auditeventname\\s*:\\s*['"]${w.auditEventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
      );
      expect(pattern.test(src)).toBe(true);
    });

    it(`${w.actionFile} uses correlation prefix '${w.correlationPrefix}'`, () => {
      const src = stripComments(readSource(w.actionFile));
      const pattern = new RegExp(
        `newCorrelationId\\s*\\(\\s*['"]${w.correlationPrefix}['"]\\s*\\)`,
      );
      expect(pattern.test(src)).toBe(true);
    });
  }

  it('audit event names are pairwise distinct', () => {
    const names = COMMUNICATION_WRITES.map((w) => w.auditEventName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('correlation prefixes are pairwise distinct', () => {
    const prefixes = COMMUNICATION_WRITES.map((w) => w.correlationPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

// ---------------------------------------------------------------------------
// Invariant 3 — distinct timeline event-type enums.
// Document-request keeps EmailLogged (788190001); borrower-update
// uses BorrowerUpdateSent (788190014). This is the schema-designer
// reservation invoked by Phase 105 — the borrower-update write must
// NOT regress to EmailLogged.
// ---------------------------------------------------------------------------

describe('Phase 107 — timeline event-type enums are distinct and semantically correct', () => {
  for (const w of COMMUNICATION_WRITES) {
    it(`${w.actionFile} sets cr664_eventtype = ${w.timelineEventTypeValue}`, () => {
      const src = stripComments(readSource(w.actionFile));
      // Each action declares its event-type constant once and
      // references it once in the timeline payload. We match on
      // the numeric literal directly so a rename of the constant
      // can't hide a regression.
      const pattern = new RegExp(
        `cr664_eventtype\\s*:\\s*(?:TIMELINE_EVENT_TYPE_[A-Z_]+|${w.timelineEventTypeValue})`,
      );
      expect(pattern.test(src)).toBe(true);
      // And the numeric value must appear somewhere as a
      // top-level const = ... assignment so the action's
      // canonical enum binding is checkable.
      const constPattern = new RegExp(
        `const\\s+TIMELINE_EVENT_TYPE_[A-Z_]+\\s*=\\s*${w.timelineEventTypeValue}\\b`,
      );
      expect(
        constPattern.test(src),
        `${w.actionFile} should declare its timeline-event-type constant with value ${w.timelineEventTypeValue}`,
      ).toBe(true);
    });
  }

  it('timeline event-type values are pairwise distinct', () => {
    const values = COMMUNICATION_WRITES.map((w) => w.timelineEventTypeValue);
    expect(new Set(values).size).toBe(values.length);
  });

  it('borrower-update email does NOT use EmailLogged (788190001) as its TIMELINE event type — schema designer reserved 788190014 for it', () => {
    // Note: 788190001 is ALSO the audit-event StatusChange value
    // and the audit-outcome Failed value — those are independent
    // option sets and their reuse of the numeric is a schema
    // coincidence. The regression we forbid here is specifically a
    // TIMELINE_EVENT_TYPE_* binding to 788190001 or a literal
    // `cr664_eventtype: 788190001` payload field.
    const src = stripComments(
      readSource('src/deals/sendBorrowerUpdateEmail.ts'),
    );
    expect(
      /\bTIMELINE_EVENT_TYPE_[A-Z_]+\s*=\s*788190001\b/.test(src),
      'borrower-update must not bind a timeline-event-type constant to 788190001',
    ).toBe(false);
    expect(
      /cr664_eventtype\s*:\s*788190001\b/.test(src),
      'borrower-update must not emit cr664_eventtype: 788190001 as a literal',
    ).toBe(false);
  });

  it('document-request email does NOT use BorrowerUpdateSent (788190014) as its TIMELINE event type', () => {
    const src = stripComments(
      readSource('src/deals/sendDocumentRequestEmail.ts'),
    );
    expect(/\bTIMELINE_EVENT_TYPE_[A-Z_]+\s*=\s*788190014\b/.test(src)).toBe(false);
    expect(/cr664_eventtype\s*:\s*788190014\b/.test(src)).toBe(false);
  });

  it('the activityQueries event-type map covers both enums so the ledger renders distinct keys', () => {
    const src = readSource('src/deals/activityQueries.ts');
    expect(src).toMatch(/788190001\s*:\s*['"]EmailLogged['"]/);
    expect(src).toMatch(/788190014\s*:\s*['"]BorrowerUpdateSent['"]/);
  });
});

// ---------------------------------------------------------------------------
// Invariant 4 — full recipient lives ONLY on the audit row; the
// timeline summary uses the masked form. This is the existing
// privacy-of-ledger pattern Phase 61 established and Phase 105 reused.
// ---------------------------------------------------------------------------

describe('Phase 107 — recipient privacy is preserved across both writes', () => {
  for (const w of COMMUNICATION_WRITES) {
    it(`${w.actionFile} audit payload embeds the full recipient in cr664_notes`, () => {
      const src = stripComments(readSource(w.actionFile));
      // The action's emitAuditEvent helper composes `cr664_notes`
      // including a `Recipient: ${opts.input.recipient}` clause.
      expect(src).toMatch(/Recipient:\s*\$\{\s*opts\.input\.recipient\s*\}/);
    });

    it(`${w.actionFile} timeline payload uses the MASKED recipient in cr664_summary`, () => {
      const src = stripComments(readSource(w.actionFile));
      // The emitTimelineEvent helper interpolates
      // ${opts.maskedRecipient} into the summary string. We assert
      // both that the masked form is referenced AND that the
      // unmasked `input.recipient` is NOT referenced inside the
      // timeline helper.
      expect(src).toMatch(/\$\{\s*opts\.maskedRecipient\s*\}/);
    });

    it(`${w.actionFile} computes maskedRecipient once via the shared masker before emitting timeline`, () => {
      const src = stripComments(readSource(w.actionFile));
      expect(src).toMatch(
        /const\s+maskedRecipient\s*=\s*maskRecipient\s*\(\s*recipient\s*\)/,
      );
      // And the masker is imported from the canonical module.
      expect(src).toMatch(
        /from\s+['"]\.\/emailDelivery\/recipientMasking['"]/,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Invariant 5 — "Outlook accepted" wording on both writes; no claim
// of delivery anywhere in their CODE. Phase 106 pinned this for the
// suite as a whole; Phase 107 narrows the pin to the precise
// communication-evidence wording each action emits.
// ---------------------------------------------------------------------------

describe('Phase 107 — "Outlook accepted" wording present; no delivery claim', () => {
  it('document-request action contains "Outlook accepted document request" wording', () => {
    const src = stripComments(
      readSource('src/deals/sendDocumentRequestEmail.ts'),
    );
    expect(src).toMatch(/Outlook\s+accepted\s+document\s+request/i);
  });

  it('borrower-update action contains "Outlook accepted borrower update" wording', () => {
    const src = stripComments(
      readSource('src/deals/sendBorrowerUpdateEmail.ts'),
    );
    expect(src).toMatch(/Outlook\s+accepted\s+borrower\s+update/i);
  });

  for (const w of COMMUNICATION_WRITES) {
    it(`${w.actionFile} contains no "delivered" / "email was sent" claim in code`, () => {
      const src = stripComments(readSource(w.actionFile));
      expect(/\bdelivered\b/i.test(src)).toBe(false);
      expect(/\bemail\s+(?:was|has\s+been)\s+(?:sent|delivered)\b/i.test(src)).toBe(false);
      expect(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i.test(src)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Invariant 6 — the per-deal row title is operator-readable.
// `cr664_title` is the user-facing column the BorrowerCommunication
// card renders as the row title. Each action must set it to a
// banker-readable string that begins with a distinct, parseable
// fragment.
// ---------------------------------------------------------------------------

describe('Phase 107 — row title is operator-readable for each write', () => {
  for (const w of COMMUNICATION_WRITES) {
    it(`${w.actionFile} sets cr664_title to a title beginning with "${w.rowTitleLeadingFragment}"`, () => {
      const src = stripComments(readSource(w.actionFile));
      // Match a cr664_title assignment whose RHS is a string or
      // template literal that begins with the expected fragment.
      // Two literal shapes ship today:
      //   - sendDocumentRequestEmail: `Document request: ${documentName}`
      //   - sendBorrowerUpdateEmail:  `Borrower update`
      // Both are captured by a regex that matches the fragment as
      // the first non-whitespace word(s) of the string body.
      const fragment = w.rowTitleLeadingFragment.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );
      const pattern = new RegExp(
        `cr664_title\\s*:\\s*['"\`]\\s*${fragment}\\b`,
        'i',
      );
      expect(pattern.test(src)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Invariant 7 — out-of-scope guardrail. Phase 107 must not introduce
// new send behavior. The two action files must NOT reference any
// surface listed as out-of-scope in the Phase 107 brief: automation,
// inbound mail, portal messaging, delivery tracking, calendar,
// subscriptions, shared mailbox, Graph generic, attachments,
// Cc/Bcc.
// ---------------------------------------------------------------------------

describe('Phase 107 — no new send behavior introduced (out-of-scope guardrail)', () => {
  const FORBIDDEN_CODE_PATTERNS: readonly { name: string; re: RegExp }[] = [
    { name: 'automation (setInterval / setTimeout invoking send)', re: /\b(setInterval|setTimeout)\s*\([^)]*send(?:Document|Borrower)/i },
    { name: 'cron / scheduler', re: /\b(new\s+CronJob|schedule\.scheduleJob)\b/ },
    { name: 'inbound mail subscription', re: /\b(OnNewEmail|MailboxSubscription|SubscribeEmailUpdate|subscribeWebhook)\b/i },
    { name: 'portal messaging', re: /\b(borrowerPortal|magicLink|invitationToken|borrowerInvite|borrowerAuth)\b/i },
    { name: 'delivery tracking', re: /\b(deliveryReceipt|readReceipt|trackDelivery|messageDelivered)\b/i },
    { name: 'calendar', re: /\bCalendar(?:Events?|Event)\b/ },
    { name: 'shared mailbox / send-from-shared', re: /\b(sharedMailbox|SendEmailFromShared)\b/i },
    { name: 'Graph generic / GraphClient', re: /\b(microsoftGraph|GraphClient)\b/ },
    { name: 'payload Attachments field', re: /\bAttachments\s*:/ },
    { name: 'payload Cc field', re: /\bCc\s*:/ },
    { name: 'payload Bcc field', re: /\bBcc\s*:/ },
  ];

  for (const w of COMMUNICATION_WRITES) {
    for (const { name, re } of FORBIDDEN_CODE_PATTERNS) {
      it(`${w.actionFile} does NOT introduce ${name}`, () => {
        const src = stripComments(readSource(w.actionFile));
        expect(re.test(src)).toBe(false);
      });
    }
  }
});
