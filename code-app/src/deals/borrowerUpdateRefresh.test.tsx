// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealData, DealDataKey } from './DealDataProvider';
import type { SendBorrowerUpdateEmailOutcome } from './sendBorrowerUpdateEmail';

/**
 * Phase 108 — borrower communication refresh after borrower-update
 * send.
 *
 * Closes the documented Phase 107 UX gap: when a banker sends a
 * borrower-update email from DraftBorrowerUpdateModal, the
 * activity ledger should reload so the new BorrowerUpdateSent
 * timeline row becomes visible on the existing
 * <BorrowerCommunication /> card without a manual page refresh.
 *
 * Pattern mirrors the Phase-104 document-request wiring in
 * DealDocuments.tsx: the parent component wraps the action call
 * and invokes refresh('after-borrower-update-email') after await.
 * Validation failures that short-circuit BEFORE the action call do
 * NOT refresh.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));
vi.mock('../banker/BankerContext', () => ({
  useOptionalBanker: vi.fn(),
}));
vi.mock('./sendBorrowerUpdateEmail', () => ({
  sendBorrowerUpdateEmail: vi.fn(),
}));

// SDK boundary stubs — sendBorrowerUpdateEmail is mocked, but
// DraftBorrowerUpdateModal also transitively imports
// isLikelyValidEmail from outlookEmailAdapters, which loads the
// connector. Stubbing the connector keeps the @microsoft/power-apps
// SDK out of this test.
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));

import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { sendBorrowerUpdateEmail } from './sendBorrowerUpdateEmail';
import { BorrowerCommunication } from './BorrowerCommunication';

const useDealDataMock = vi.mocked(useDealData);
const useOptionalBankerMock = vi.mocked(useOptionalBanker);
const sendBorrowerUpdateEmailMock = vi.mocked(sendBorrowerUpdateEmail);

const baseDeal: DealDetail = {
  id: 'deal-108',
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

function makeDealData(refresh: (k: DealDataKey) => void): DealData {
  return {
    deal: baseDeal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } },
    activity: { kind: 'ready', data: [] },
    refresh,
  };
}

function setUpBanker({ withSystemUserId = true } = {}) {
  useOptionalBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm.paller@bank.example.com',
    systemUserId: withSystemUserId ? 'sys-user-1' : undefined,
    writeDisabledReason: withSystemUserId
      ? undefined
      : 'No matching cr664_users row for the signed-in Entra OID.',
  });
}

beforeEach(() => {
  sendBorrowerUpdateEmailMock.mockReset();
  useDealDataMock.mockReset();
  useOptionalBankerMock.mockReset();
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

async function openDraftModal() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /draft borrower update/i }));
  return user;
}

async function fillSendForm(
  user: ReturnType<typeof userEvent.setup>,
  {
    recipient = 'borrower@example.com',
    note = 'Borrower asked for a status update.',
  }: { recipient?: string; note?: string } = {},
) {
  await user.type(
    screen.getByLabelText(/banker note \/ reason for this update/i),
    note,
  );
  if (recipient.length > 0) {
    await user.type(screen.getByLabelText(/recipient email/i), recipient);
  }
}

describe('Phase 108 — Send completion refreshes the activity ledger', () => {
  it('clicking Send invokes refresh("after-borrower-update-email") exactly once after a successful send', async () => {
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker();
    sendBorrowerUpdateEmailMock.mockResolvedValue({
      kind: 'success',
      mode: 'LIVE',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
    } as SendBorrowerUpdateEmailOutcome);

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    await fillSendForm(user);
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );

    await waitFor(() => {
      expect(sendBorrowerUpdateEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('after-borrower-update-email');
  });

  it('refresh fires even in DRY_RUN mode (the timeline row IS written in DRY_RUN; the operator still expects to see it)', async () => {
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker();
    sendBorrowerUpdateEmailMock.mockResolvedValue({
      kind: 'success',
      mode: 'DRY_RUN',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
    } as SendBorrowerUpdateEmailOutcome);

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    await fillSendForm(user);
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );

    await waitFor(() => {
      expect(sendBorrowerUpdateEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(refresh).toHaveBeenCalledWith('after-borrower-update-email');
  });

  it('refresh fires even on a send-failed outcome (mirrors document-request pattern; failed audit row was written)', async () => {
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker();
    sendBorrowerUpdateEmailMock.mockResolvedValue({
      kind: 'send-failed',
      sendError: '503 backend unavailable',
      transient: true,
      mode: 'LIVE',
    } as SendBorrowerUpdateEmailOutcome);

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    await fillSendForm(user);
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );

    await waitFor(() => {
      expect(sendBorrowerUpdateEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(refresh).toHaveBeenCalledWith('after-borrower-update-email');
  });

  it('refresh fires on a governance-partial outcome (timeline OR audit failed AFTER Outlook accepted; whatever did land should be visible)', async () => {
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker();
    sendBorrowerUpdateEmailMock.mockResolvedValue({
      kind: 'governance-partial',
      mode: 'LIVE',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
      auditError: undefined,
      timelineError: 'timeline 500',
    } as SendBorrowerUpdateEmailOutcome);

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    await fillSendForm(user);
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );

    await waitFor(() => {
      expect(sendBorrowerUpdateEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(refresh).toHaveBeenCalledWith('after-borrower-update-email');
  });
});

describe('Phase 108 — refresh does NOT fire when the action is not invoked', () => {
  it('missing recipient: Send button stays disabled, action is not called, refresh is not called', async () => {
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker();

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    // Fill banker note but leave recipient empty.
    await fillSendForm(user, { recipient: '' });

    const sendBtn = screen.getByRole('button', {
      name: /send borrower update through outlook/i,
    });
    expect(sendBtn).toBeDisabled();
    // Attempting to click a disabled button is a no-op in userEvent;
    // still assert nothing fired.
    await user.click(sendBtn);
    expect(sendBorrowerUpdateEmailMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalledWith('after-borrower-update-email');
  });

  it('missing systemUserId: Send button stays disabled, action is not called, refresh is not called', async () => {
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker({ withSystemUserId: false });

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    // Fill recipient + note so the OTHER gates pass — the only thing
    // that's missing is the systemUserId, which is a separate gate.
    await fillSendForm(user);

    const sendBtn = screen.getByRole('button', {
      name: /send borrower update through outlook/i,
    });
    expect(sendBtn).toBeDisabled();
    await user.click(sendBtn);
    expect(sendBorrowerUpdateEmailMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalledWith('after-borrower-update-email');
  });

  it('Copy path: does NOT call sendBorrowerUpdateEmail and does NOT trigger the borrower-update refresh', async () => {
    // The clipboard side-effect of Copy is already tested at the
    // modal level (Phase 105). Phase 108 only pins that Copy is
    // ISOLATED from the email-send refresh wiring — clicking Copy
    // must not call the action and must not invalidate the activity
    // ledger via the new refresh key.
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker();

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    await user.type(
      screen.getByLabelText(/banker note \/ reason for this update/i),
      'Quick weekly note',
    );
    await user.click(
      screen.getByRole('button', { name: /copy draft to clipboard/i }),
    );

    expect(sendBorrowerUpdateEmailMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalledWith('after-borrower-update-email');
  });
});

describe('Phase 108 — order of operations: refresh fires AFTER the action returns', () => {
  it('refresh is called only after sendBorrowerUpdateEmail resolves (not before, not in parallel)', async () => {
    const refresh = vi.fn();
    useDealDataMock.mockReturnValue(makeDealData(refresh));
    setUpBanker();

    let resolveSend!: (o: SendBorrowerUpdateEmailOutcome) => void;
    sendBorrowerUpdateEmailMock.mockReturnValue(
      new Promise<SendBorrowerUpdateEmailOutcome>((res) => {
        resolveSend = res;
      }),
    );

    render(<BorrowerCommunication />);
    const user = await openDraftModal();
    await fillSendForm(user);
    await user.click(
      screen.getByRole('button', { name: /send borrower update through outlook/i }),
    );

    // The action is in-flight; refresh must NOT have been called yet.
    await waitFor(() => {
      expect(sendBorrowerUpdateEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(refresh).not.toHaveBeenCalledWith('after-borrower-update-email');

    // Resolve the action; refresh should fire on the next microtask.
    resolveSend({
      kind: 'success',
      mode: 'LIVE',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
    });
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith('after-borrower-update-email');
    });
  });
});

// ---------------------------------------------------------------------------
// Static-source regression pins. These are belt-and-suspenders next
// to the runtime tests — they assert at CI time that the existing
// Phase-104 refresh wiring is unchanged AND the new Phase-108 wiring
// is in place. If a future refactor moves the call site, the
// runtime assertions still catch behavioral regressions, but the
// static pins fail-fast with a clear "the call site moved" signal.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('Phase 108 — static-source regression pins', () => {
  it("DealDataProvider exposes 'after-borrower-update-email' on the DealDataKey union", () => {
    const src = readSource('src/deals/DealDataProvider.tsx');
    expect(src).toMatch(/['"]after-borrower-update-email['"]/);
    // And the refresh switch has a case for it.
    expect(src).toMatch(/case\s+['"]after-borrower-update-email['"]/);
  });

  it("DealDataProvider's 'after-borrower-update-email' case reloads activity ONLY (no documents / tasks / creditMemo)", () => {
    const src = readSource('src/deals/DealDataProvider.tsx');
    // Pull out just the case body for assertion.
    const match = src.match(
      /case\s+['"]after-borrower-update-email['"]:[\s\S]*?break;/,
    );
    expect(match, "expected an 'after-borrower-update-email' case body").toBeTruthy();
    const body = match![0];
    expect(body).toMatch(/reloadActivity\s*\(\s*\)/);
    expect(body).not.toMatch(/reloadDocuments\s*\(\s*\)/);
    expect(body).not.toMatch(/reloadTasks\s*\(\s*\)/);
    expect(body).not.toMatch(/reloadCreditMemo\s*\(\s*\)/);
  });

  it("BorrowerCommunication.tsx wires refresh('after-borrower-update-email') after sendBorrowerUpdateEmail", () => {
    const src = readSource('src/deals/BorrowerCommunication.tsx');
    expect(src).toMatch(/await\s+sendBorrowerUpdateEmail\s*\(/);
    expect(src).toMatch(/refresh\s*\(\s*['"]after-borrower-update-email['"]\s*\)/);
  });

  it("Phase 104 document-request refresh remains wired (regression check)", () => {
    const src = readSource('src/deals/DealDocuments.tsx');
    expect(src).toMatch(/refresh\s*\(\s*['"]after-document-request-email['"]\s*\)/);
    // And the handoff refresh too — Phase 63 is unchanged.
    expect(src).toMatch(/refresh\s*\(\s*['"]after-document-request-handoff['"]\s*\)/);
  });

  it("BorrowerCommunication.tsx does NOT introduce any NEW Outlook connector import, SendEmailV2 call, or payload field", () => {
    const src = readSource('src/deals/BorrowerCommunication.tsx');
    // Phase 108 is refresh wiring only — it must not touch the
    // Outlook surface.
    expect(src).not.toMatch(
      /from\s+['"][^'"]*Office365OutlookService['"]/,
    );
    expect(src).not.toMatch(/SendEmailV2/);
    // No payload field expansion sneaking in via the wrapper.
    for (const forbidden of ['Attachments', 'Cc', 'Bcc', 'From', 'ReplyTo', 'Sensitivity']) {
      const pattern = new RegExp(`\\b${forbidden}\\b\\s*:`);
      expect(pattern.test(src), `BorrowerCommunication must not set a ${forbidden} field`).toBe(false);
    }
  });
});
