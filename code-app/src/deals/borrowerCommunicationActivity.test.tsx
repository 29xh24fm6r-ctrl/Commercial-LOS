// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealData } from './DealDataProvider';
import type { TimelineEvent } from './activityQueries';

/**
 * Phase 107 — narrow rendering pin for the BorrowerCommunication
 * ledger card. Proves that both completed Outlook-backed governed
 * writes (Phase 104 document-request email, Phase 105 borrower-update
 * email) render side-by-side under the existing communication
 * surface with:
 *   - distinct row titles ("Document request: <name>" vs "Borrower update"),
 *   - the masked recipient form in the summary,
 *   - the literal "Outlook accepted" phrase (LIVE-mode evidence),
 *   - no claim of delivery anywhere in the rendered DOM,
 *   - distinct event-type badges (EmailLogged vs BorrowerUpdateSent).
 *
 * Phase 107 adds NO new render path. It exercises the existing
 * `<BorrowerCommunication />` card by feeding it two mock activity
 * rows shaped exactly as the actions emit. If a future change ever
 * widens the rendered surface (e.g. starts displaying the full
 * recipient, drops the "Outlook accepted" phrase, or collapses
 * BorrowerUpdateSent into EmailLogged), this file fails loudly.
 *
 * Out of scope:
 *   - no new UI is created here,
 *   - no Dataverse write is invoked,
 *   - no new card is added; the card under test is the existing
 *     Phase 23 BorrowerCommunication card with its
 *     Phase-23-defined BORROWER_COMM_TYPES filter (which already
 *     includes both EmailLogged and BorrowerUpdateSent).
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

// BorrowerCommunication consults the optional banker identity for
// the Draft button's enabled/disabled state — irrelevant to row
// rendering. Stub it to a banker identity so the card renders the
// action row exactly as it would in normal banker workspace use.
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: vi.fn(),
}));

// Phase 105: BorrowerCommunication imports sendBorrowerUpdateEmail
// at module scope. Stub it at the boundary so the @microsoft/power-
// apps SDK doesn't load during this rendering test.
vi.mock('./sendBorrowerUpdateEmail', () => ({
  sendBorrowerUpdateEmail: vi.fn(),
}));

// DraftBorrowerUpdateModal (rendered transitively when the banker
// clicks "Draft Borrower Update") imports isLikelyValidEmail from
// outlookEmailAdapters, which in turn imports the connector
// service. Stub the connector at the SDK boundary so its
// @microsoft/power-apps transitive dep is not loaded during this
// rendering test.
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));

import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { BorrowerCommunication } from './BorrowerCommunication';

const useDealDataMock = vi.mocked(useDealData);
const useOptionalBankerMock = vi.mocked(useOptionalBanker);

const baseDeal: DealDetail = {
  id: 'deal-107',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-06-30T00:00:00Z',
  productType: undefined,
  loanStructure: undefined,
  customerType: undefined,
  industry: undefined,
  guarantorStructure: undefined,
  pricingType: undefined,
  spreadIndex: undefined,
  spreadMargin: undefined,
  collateralSummary: undefined,
  createdOn: undefined,
  stageEntryDate: undefined,
  isClosed: false,
};

const FULL_RECIPIENT = 'borrower@example.com';
const MASKED_RECIPIENT = 'b***@e***.com';

// Two activity rows shaped as the action layers emit them after
// Phase 104 / 105. Note the timeline payload uses the masked form,
// per the privacy-of-ledger discipline (full recipient lives only
// on the audit row, which is the privileged ledger surface).
const docRequestRow: TimelineEvent = {
  id: 'tl-doc-1',
  title: 'Document request: Personal Financial Statement',
  // sendDocumentRequestEmail emitTimelineEvent summary, LIVE branch.
  summary: `Outlook accepted document request to ${MASKED_RECIPIENT}.`,
  eventAt: '2026-05-20T15:00:00Z',
  eventType: 'EmailLogged',
  eventTypeKey: 'EmailLogged',
  eventSubType: 'correlation:test-corr-1',
  isSystemGenerated: false,
  actorName: 'M. Paller',
  relatedEntityType: 'cr664_documentchecklist',
  relatedEntityId: 'doc-1',
};

const borrowerUpdateRow: TimelineEvent = {
  id: 'tl-bu-1',
  title: 'Borrower update',
  // sendBorrowerUpdateEmail emitTimelineEvent summary, LIVE branch.
  summary: `Outlook accepted borrower update to ${MASKED_RECIPIENT}.`,
  eventAt: '2026-05-21T09:30:00Z',
  eventType: 'BorrowerUpdateSent',
  eventTypeKey: 'BorrowerUpdateSent',
  eventSubType: 'correlation:test-corr-2',
  isSystemGenerated: false,
  actorName: 'M. Paller',
  relatedEntityType: 'cr664_loandeal',
  relatedEntityId: 'deal-107',
};

function ready(events: TimelineEvent[]): DealData {
  return {
    deal: baseDeal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: events },
    refresh: () => undefined,
  };
}

function setUpStandardMocks(events: TimelineEvent[]) {
  useDealDataMock.mockReturnValue(ready(events));
  useOptionalBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm.paller@bank.example.com',
    systemUserId: 'sys-user-1',
    writeDisabledReason: undefined,
  });
}

describe('Phase 107 — BorrowerCommunication renders both completed governed-write rows', () => {
  it('renders the document-request email row with title "Document request: ..." and the EmailLogged badge', () => {
    setUpStandardMocks([docRequestRow]);
    render(<BorrowerCommunication />);
    expect(
      screen.getByText('Document request: Personal Financial Statement'),
    ).toBeInTheDocument();
    expect(screen.getByText('EmailLogged')).toBeInTheDocument();
  });

  it('renders the borrower-update email row with title "Borrower update" and the BorrowerUpdateSent badge', () => {
    setUpStandardMocks([borrowerUpdateRow]);
    render(<BorrowerCommunication />);
    expect(screen.getByText('Borrower update')).toBeInTheDocument();
    expect(screen.getByText('BorrowerUpdateSent')).toBeInTheDocument();
  });

  it('renders both rows together when both are present in the activity stream', () => {
    setUpStandardMocks([borrowerUpdateRow, docRequestRow]);
    render(<BorrowerCommunication />);
    expect(
      screen.getByText('Document request: Personal Financial Statement'),
    ).toBeInTheDocument();
    expect(screen.getByText('Borrower update')).toBeInTheDocument();
    // Both event-type badges render.
    expect(screen.getByText('EmailLogged')).toBeInTheDocument();
    expect(screen.getByText('BorrowerUpdateSent')).toBeInTheDocument();
  });
});

describe('Phase 107 — masked recipient + "Outlook accepted" wording in rendered DOM', () => {
  it('renders the masked recipient form in both row summaries', () => {
    setUpStandardMocks([docRequestRow, borrowerUpdateRow]);
    render(<BorrowerCommunication />);
    const everyText = document.body.textContent ?? '';
    // The masked recipient appears at least twice — once per row.
    const occurrences = everyText.split(MASKED_RECIPIENT).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('does NOT render the full recipient anywhere in the DOM', () => {
    setUpStandardMocks([docRequestRow, borrowerUpdateRow]);
    render(<BorrowerCommunication />);
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toContain(FULL_RECIPIENT);
  });

  it('renders the literal "Outlook accepted document request" phrase for the document-request row', () => {
    setUpStandardMocks([docRequestRow]);
    render(<BorrowerCommunication />);
    expect(
      screen.getByText(/Outlook accepted document request to b\*\*\*@e\*\*\*\.com\./i),
    ).toBeInTheDocument();
  });

  it('renders the literal "Outlook accepted borrower update" phrase for the borrower-update row', () => {
    setUpStandardMocks([borrowerUpdateRow]);
    render(<BorrowerCommunication />);
    expect(
      screen.getByText(/Outlook accepted borrower update to b\*\*\*@e\*\*\*\.com\./i),
    ).toBeInTheDocument();
  });

  it('does NOT render any "delivered" / "email sent" / "email delivered" claim anywhere', () => {
    setUpStandardMocks([docRequestRow, borrowerUpdateRow]);
    render(<BorrowerCommunication />);
    const everyText = document.body.textContent ?? '';
    expect(everyText).not.toMatch(/\bdelivered\b/i);
    expect(everyText).not.toMatch(/\bemail\s+(sent|delivered)\b/i);
    expect(everyText).not.toMatch(/\bsent\s+(an?\s+)?email\b/i);
    expect(everyText).not.toMatch(/\bborrower\s+(?:was|has\s+been)\s+notified\b/i);
  });
});

describe('Phase 107 — event-type badges distinguish the two writes', () => {
  it('document-request row carries EmailLogged badge and NOT BorrowerUpdateSent', () => {
    setUpStandardMocks([docRequestRow]);
    render(<BorrowerCommunication />);
    expect(screen.getByText('EmailLogged')).toBeInTheDocument();
    expect(screen.queryByText('BorrowerUpdateSent')).toBeNull();
  });

  it('borrower-update row carries BorrowerUpdateSent badge and NOT EmailLogged', () => {
    setUpStandardMocks([borrowerUpdateRow]);
    render(<BorrowerCommunication />);
    expect(screen.getByText('BorrowerUpdateSent')).toBeInTheDocument();
    expect(screen.queryByText('EmailLogged')).toBeNull();
  });
});

describe('Phase 107 — DRY_RUN-mode summaries also render honestly when present', () => {
  // When EMAIL_MODE is DRY_RUN the action's emitTimelineEvent
  // produces a different summary string. The ledger MUST surface
  // that honestly — no claim that an actual send occurred.
  const docRequestDryRunRow: TimelineEvent = {
    ...docRequestRow,
    summary: `Document request prepared for ${MASKED_RECIPIENT}. Mode: DRY_RUN; nothing left the client.`,
  };
  const borrowerUpdateDryRunRow: TimelineEvent = {
    ...borrowerUpdateRow,
    summary: `Borrower update prepared for ${MASKED_RECIPIENT}. Mode: DRY_RUN; nothing left the client.`,
  };

  it('renders the document-request DRY_RUN summary verbatim, including "nothing left the client"', () => {
    setUpStandardMocks([docRequestDryRunRow]);
    render(<BorrowerCommunication />);
    expect(
      screen.getByText(/Document request prepared for b\*\*\*@e\*\*\*\.com\. Mode: DRY_RUN; nothing left the client\./),
    ).toBeInTheDocument();
  });

  it('renders the borrower-update DRY_RUN summary verbatim, including "nothing left the client"', () => {
    setUpStandardMocks([borrowerUpdateDryRunRow]);
    render(<BorrowerCommunication />);
    expect(
      screen.getByText(/Borrower update prepared for b\*\*\*@e\*\*\*\.com\. Mode: DRY_RUN; nothing left the client\./),
    ).toBeInTheDocument();
  });
});
