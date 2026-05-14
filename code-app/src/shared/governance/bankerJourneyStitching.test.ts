import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 59: Banker Journey Stitching Regression.
 *
 * The Phase 59 audit traced the banker's daily journey end-to-end:
 *
 *   1. Open banker workspace          (BankerWorkspace.tsx)
 *   2. Review work queue              (MyWorkQueue.tsx)
 *   3. Open deal                      (DealRoute.tsx → banker case)
 *   4. Request document               (Phase 22, deal-document-request)
 *   5. Mark received                  (Phase 51, deal-document-receive)
 *   6. Mark reviewed                  (Phase 55, deal-document-review)
 *   7. Complete task                  (Phase 21, deal-task-complete)
 *   8. Save memo draft                (Phase 25, credit-memo-draft-save)
 *   9. Confirm timeline/audit visible (ActivityTimeline.tsx)
 *
 * The Phase 46–50 governance sweeps already verify each governed
 * write in isolation. This file verifies the STITCHING — that the
 * banker can drive every step from one workspace, the right cards
 * mount, the right refresh keys exist, the right modals are wired
 * to the right actions.
 *
 * Static-source assertions only. No runtime mocking. A failure
 * here means the journey is structurally broken (a missing
 * import, a missing refresh key, a missing card mount) — not that
 * a write returned the wrong outcome.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. BankerDealWorkspace mounts every operational card
// ---------------------------------------------------------------------------

describe('Phase 59 — BankerDealWorkspace mounts every operational card', () => {
  // The cards a banker uses in a single deal session. Order is
  // visual / mental, not load order; we only assert presence.
  const REQUIRED_CARDS: readonly string[] = [
    'DealHeader',
    'DealSummary',
    'DealBlockers',
    'DealStageProgressionCard',
    'DealTasks',
    'DealDocuments',
    'CreditMemo',
    'ActivityTimeline',
    'BorrowerCommunication',
  ];

  for (const card of REQUIRED_CARDS) {
    it(`BankerDealWorkspace imports and mounts <${card}>`, () => {
      const src = readSource('src/deals/BankerDealWorkspace.tsx');
      // Import line.
      const importRe = new RegExp(
        `import\\s*\\{[^}]*\\b${card}\\b[^}]*\\}\\s*from\\s+['"][^'"]+['"]`,
      );
      expect(importRe.test(src), `${card} is not imported`).toBe(true);
      // JSX usage.
      const jsxRe = new RegExp(`<${card}\\b`);
      expect(jsxRe.test(src), `<${card}> is not mounted`).toBe(true);
    });
  }

  it('BankerDealWorkspace wraps the cards in <DealDataProvider>', () => {
    const src = readSource('src/deals/BankerDealWorkspace.tsx');
    expect(src).toMatch(/<DealDataProvider\b/);
    expect(src).toMatch(
      /import\s*\{[^}]*\bDealDataProvider\b[^}]*\}\s*from\s+['"]\.\/DealDataProvider['"]/,
    );
  });

  it('BankerDealWorkspace authorizes via loadDealForBanker before mounting children', () => {
    const src = readSource('src/deals/BankerDealWorkspace.tsx');
    expect(src).toMatch(/loadDealForBanker\(/);
    // Children only mount in the 'ready' branch of the load state.
    expect(src).toMatch(/state\.kind === 'denied'/);
  });
});

// ---------------------------------------------------------------------------
// 2. DealDataProvider exposes a refresh key for every governed
//    deal-domain write
// ---------------------------------------------------------------------------

describe('Phase 59 — DealDataProvider exposes a refresh key per governed deal write', () => {
  // Five governed deal-domain writes; five refresh keys.
  const REQUIRED_REFRESH_KEYS: readonly string[] = [
    'after-task-complete', // Phase 21
    'after-document-request', // Phase 22
    'after-document-receive', // Phase 51
    'after-document-review', // Phase 55
    'after-credit-memo-draft-saved', // Phase 25
  ];

  for (const key of REQUIRED_REFRESH_KEYS) {
    it(`DealDataKey union contains '${key}'`, () => {
      const src = readSource('src/deals/DealDataProvider.tsx');
      // The union literal appears in the export type definition.
      const unionRe = new RegExp(`['"]${key}['"]`);
      expect(unionRe.test(src), `union missing '${key}'`).toBe(true);
    });

    it(`refresh() dispatch handles case '${key}'`, () => {
      const src = readSource('src/deals/DealDataProvider.tsx');
      const caseRe = new RegExp(`case\\s+['"]${key}['"]\\s*:`);
      expect(caseRe.test(src), `no case for '${key}' in refresh()`).toBe(true);
    });
  }

  it('every after-X refresh case reloads activity (so audit/timeline events appear immediately)', () => {
    // The activity reload is what makes step 9 (Confirm timeline /
    // audit-visible events) part of the journey, not a separate
    // manual step. If a refresh key forgot to reload activity, the
    // event would be silently missing from the UI until the next
    // page refresh.
    const src = readSource('src/deals/DealDataProvider.tsx');
    // We approximate the invariant by counting case statements and
    // reloadActivity() calls in the switch block. Five governed
    // refresh keys → at least five reloadActivity() calls.
    const switchStart = src.indexOf('switch (key)');
    expect(switchStart, 'expected switch(key) in refresh()').toBeGreaterThan(-1);
    const switchEnd = src.indexOf('}\n  }, []);', switchStart);
    const switchBody =
      switchEnd > switchStart ? src.slice(switchStart, switchEnd) : src.slice(switchStart);
    const reloadActivityCalls =
      switchBody.match(/reloadActivity\s*\(/g) ?? [];
    expect(
      reloadActivityCalls.length,
      `expected ≥5 reloadActivity() calls in refresh() switch; found ${reloadActivityCalls.length}`,
    ).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 3. Every operational write surface mounts its modal in the right
//    parent card
// ---------------------------------------------------------------------------

interface ModalMountTarget {
  /** Card / surface file that owns the modal mount. */
  parentFile: string;
  /** Modal component name that must be imported AND mounted in parentFile. */
  modal: string;
  /** Action function the modal's onConfirm calls. */
  action: string;
  /** Phase that introduced this surface. */
  phase: number;
}

const MODAL_MOUNTS: readonly ModalMountTarget[] = [
  {
    parentFile: 'src/deals/DealTasks.tsx',
    modal: 'CompleteTaskModal',
    action: 'completeTask',
    phase: 21,
  },
  {
    parentFile: 'src/deals/DealDocuments.tsx',
    modal: 'RequestDocumentModal',
    action: 'requestDocument',
    phase: 22,
  },
  {
    parentFile: 'src/deals/DealDocuments.tsx',
    modal: 'ReceiveDocumentModal',
    action: 'markDocumentReceived',
    phase: 51,
  },
  {
    parentFile: 'src/deals/DealDocuments.tsx',
    modal: 'ReviewDocumentModal',
    action: 'markDocumentReviewed',
    phase: 55,
  },
  {
    parentFile: 'src/deals/CreditMemo.tsx',
    modal: 'CreditMemoDraftModal',
    action: 'saveCreditMemoDraft',
    phase: 25,
  },
];

describe('Phase 59 — each card mounts its modal and wires the right action', () => {
  for (const m of MODAL_MOUNTS) {
    it(`${m.parentFile} mounts <${m.modal}> and imports ${m.action} (Phase ${m.phase})`, () => {
      const src = readSource(m.parentFile);
      // Modal is imported AND mounted in JSX.
      const modalImportRe = new RegExp(
        `import\\s*\\{[^}]*\\b${m.modal}\\b[^}]*\\}\\s*from\\s+['"][^'"]+['"]`,
      );
      expect(modalImportRe.test(src), `${m.parentFile} missing import of ${m.modal}`).toBe(
        true,
      );
      const modalJsxRe = new RegExp(`<${m.modal}\\b`);
      expect(modalJsxRe.test(src), `${m.parentFile} does not mount <${m.modal}>`).toBe(
        true,
      );
      // Action is imported.
      const actionImportRe = new RegExp(
        `import\\s*\\{[^}]*\\b${m.action}\\b[^}]*\\}\\s*from\\s+['"][^'"]+['"]`,
      );
      expect(
        actionImportRe.test(src),
        `${m.parentFile} missing import of ${m.action}`,
      ).toBe(true);
      // Action is called somewhere in the file (the modal's onConfirm
      // handler wraps it).
      const actionCallRe = new RegExp(`\\b${m.action}\\s*\\(`);
      expect(
        actionCallRe.test(src),
        `${m.parentFile} imports ${m.action} but never calls it`,
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. MyWorkQueue surfaces both Phase 53 (receive) and Phase 55 (review)
//    inline actions
// ---------------------------------------------------------------------------

describe('Phase 59 — MyWorkQueue surfaces both inline write actions', () => {
  it('MyWorkQueue imports the receive modal + action and the review modal + action', () => {
    const src = readSource('src/banker/MyWorkQueue.tsx');
    // Receive (Phase 53).
    expect(src).toMatch(/\bReceiveDocumentModal\b/);
    expect(src).toMatch(/\bmarkDocumentReceived\b/);
    // Review (Phase 55).
    expect(src).toMatch(/\bReviewDocumentModal\b/);
    expect(src).toMatch(/\bmarkDocumentReviewed\b/);
  });

  it('MyWorkQueue mounts both modals (conditional render)', () => {
    const src = readSource('src/banker/MyWorkQueue.tsx');
    expect(src).toMatch(/<ReceiveDocumentModal\b/);
    expect(src).toMatch(/<ReviewDocumentModal\b/);
  });

  it('MyWorkQueue gates both buttons on systemUserId presence (canReceive / canReview)', () => {
    const src = readSource('src/banker/MyWorkQueue.tsx');
    // The single canReceive gate flows into both canReceive and
    // canReview row props (Phase 55 reuses the same systemUserId
    // check). Verify the gate exists.
    expect(src).toMatch(/canReceive\s*=\s*!!?systemUserId/);
  });

  it('MyWorkQueue Row supports both showReceive and showReview branches', () => {
    const src = readSource('src/banker/MyWorkQueue.tsx');
    expect(src).toMatch(/\bshowReceive\b/);
    expect(src).toMatch(/\bshowReview\b/);
    // Each show flag is keyed off a specific work-queue item type.
    expect(src).toMatch(/'overdue-document'/);
    expect(src).toMatch(/'pending-review-document'/);
  });
});

// ---------------------------------------------------------------------------
// 5. DealRoute dispatches the banker case to BankerProvider +
//    BankerDealWorkspace
// ---------------------------------------------------------------------------

describe('Phase 59 — DealRoute banker case mounts BankerProvider + BankerDealWorkspace', () => {
  it('DealRoute imports BankerProvider and BankerDealWorkspace', () => {
    const src = readSource('src/deals/DealRoute.tsx');
    expect(src).toMatch(
      /import\s*\{\s*BankerProvider\s*\}\s*from\s+['"]\.\.\/banker\/BankerProvider['"]/,
    );
    expect(src).toMatch(
      /import\s*\{\s*BankerDealWorkspace\s*\}\s*from\s+['"]\.\/BankerDealWorkspace['"]/,
    );
  });

  it('DealRoute mounts <BankerProvider> wrapping <BankerDealWorkspace> in the banker branch', () => {
    const src = readSource('src/deals/DealRoute.tsx');
    // The banker branch wraps the workspace in the provider.
    // Conservative regex: both JSX tokens must appear within the
    // banker case region. We assert both appear; the structural
    // wrapping is already covered by DealRoute.test.tsx (Phase 38).
    expect(src).toMatch(/<BankerProvider\b/);
    expect(src).toMatch(/<BankerDealWorkspace\b/);
  });
});

// ---------------------------------------------------------------------------
// 6. ActivityTimeline consumes refreshed activity from DealDataProvider
//    (the link between writes and the audit-visible event surface)
// ---------------------------------------------------------------------------

describe('Phase 59 — ActivityTimeline consumes refreshed activity from DealDataProvider', () => {
  it('ActivityTimeline reads activity via useDealData()', () => {
    const src = readSource('src/deals/ActivityTimeline.tsx');
    expect(src).toMatch(/\buseDealData\s*\(/);
    expect(src).toMatch(/\bactivity\b/);
  });
});
