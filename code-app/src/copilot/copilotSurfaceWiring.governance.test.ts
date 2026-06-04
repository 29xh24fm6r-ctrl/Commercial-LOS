import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  getCopilotAdapter,
  createNotConfiguredAdapter,
} from './copilotAssistantAdapter';

/**
 * Phase 130A — Copilot surface-wiring governance pins.
 *
 * Locks the launch contract for the Copilot assistant after it is
 * wired into the four user-facing LOS surfaces:
 *
 *   §1  Default adapter is not_configured — no live connector is
 *       required for the app to build & run. Every default response is
 *       honestly non-live.
 *   §2  Each of the four surfaces mounts the CopilotAssistPanel
 *       (deal cockpit via DealCopilotAssist; manager / portfolio /
 *       team cockpits directly), with the correct surface kind.
 *   §3  The Copilot module performs NO network / connector call
 *       (no fetch / Office365 / SendEmailV2 / Graph / MSAL).
 *   §4  The dense cockpit bodies stay free of raw write affordances
 *       (<button> / <form> / onClick / onSubmit live only inside the
 *       encapsulated CopilotAssistPanel component, never in the
 *       cockpit source) — the Copilot buttons are read-only local
 *       actions, not data mutations.
 */

const SRC = resolve(__dirname, '..');

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8');
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const COPILOT_MODULE_FILES = [
  'copilot/copilotAssistantAdapter.ts',
  'copilot/CopilotAssistPanel.tsx',
  'copilot/CopilotPromptBar.tsx',
  'copilot/CopilotResponseCard.tsx',
  'copilot/CopilotNotConfiguredState.tsx',
  'copilot/DealCopilotAssist.tsx',
  'copilot/dealCopilotContext.ts',
  'copilot/workspaceCopilotContext.ts',
] as const;

// The dense cockpit bodies that embed a workspace Copilot panel. Their
// read-only static-source posture must hold after the Phase 130A wiring.
const COCKPIT_BODIES = [
  'manager/ManagerBloombergControlPanel.tsx',
  'portfolio/PortfolioCommandCenter.tsx',
  'team/TeamOpsQueue.tsx',
] as const;

// ---------------------------------------------------------------------------
// §1 — default adapter is not_configured (no live connector required)
// ---------------------------------------------------------------------------

describe('Phase 130A §1 — Copilot runs with no live connector', () => {
  it('the default singleton adapter is not_configured', () => {
    expect(getCopilotAdapter().mode).toBe('not_configured');
  });

  it('every not-configured response is non-live and says so', () => {
    const a = createNotConfiguredAdapter();
    const ctx = {
      dealName: 'D',
      clientName: 'C',
      stage: 'Underwriting',
      status: 'Active',
      amount: 1,
      taskCount: 0,
      openTaskCount: 0,
      documentCount: 0,
      outstandingDocumentCount: 0,
      blockerCount: 0,
      blockerSummaries: [],
    };
    const responses = [
      a.summarizeDeal(ctx),
      a.suggestNextActions(ctx),
      a.explainMissingFields(ctx),
      a.explainBlockers(ctx),
      a.summarizeWorkspace({
        workspaceRole: 'manager',
        userName: undefined,
        teamName: undefined,
        dealCount: 0,
        urgentItemCount: 0,
        kpiSummaries: [],
      }),
    ];
    for (const r of responses) {
      expect(r.isLive).toBe(false);
      expect(r.mode).toBe('not_configured');
      expect(r.text).toMatch(/not configured/i);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — each surface mounts the panel with the correct surface kind
// ---------------------------------------------------------------------------

describe('Phase 130A §2 — every surface mounts the CopilotAssistPanel', () => {
  it('the deal cockpit mounts DealCopilotAssist in the right rail', () => {
    const banker = read('deals/BankerDealWorkspace.tsx');
    expect(banker).toMatch(
      /import\s+\{\s*DealCopilotAssist\s*\}\s+from\s+['"][^'"]*\/copilot\/DealCopilotAssist['"]/,
    );
    expect(banker).toMatch(/<DealCopilotAssist\s*\/>/);
  });

  it('DealCopilotAssist renders the panel with surface="deal" via the deal context builder', () => {
    const src = read('copilot/DealCopilotAssist.tsx');
    expect(src).toMatch(/buildDealCopilotContext/);
    expect(src).toMatch(/surface=["']deal["']/);
    // Reads only already-loaded provider/context hooks — no new query.
    expect(src).toMatch(/useDealData/);
    expect(src).not.toMatch(/loadDeal|getAll\(|fetch\(/);
  });

  for (const rel of COCKPIT_BODIES) {
    it(`${rel} mounts the workspace CopilotAssistPanel from the loaded snapshot`, () => {
      const src = read(rel);
      expect(src).toMatch(
        /import\s+\{\s*CopilotAssistPanel\s*\}\s+from\s+['"][^'"]*\/copilot\/CopilotAssistPanel['"]/,
      );
      expect(src).toMatch(/buildWorkspaceCopilotContext/);
      expect(src).toMatch(/surface=["']workspace["']/);
    });
  }
});

// ---------------------------------------------------------------------------
// §3 — no network / connector call anywhere in the Copilot module
// ---------------------------------------------------------------------------

describe('Phase 130A §3 — Copilot module makes no external call', () => {
  for (const rel of COPILOT_MODULE_FILES) {
    it(`${rel} has no network / connector reference`, () => {
      const src = stripComments(read(rel));
      expect(src).not.toMatch(/fetch\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/SendEmailV2/);
      expect(src).not.toMatch(/Office365/);
      expect(src).not.toMatch(/microsoft-graph|graph\.microsoft/i);
      expect(src).not.toMatch(/msal/i);
    });
  }
});

// ---------------------------------------------------------------------------
// §4 — cockpit bodies stay free of raw write affordances after wiring
// ---------------------------------------------------------------------------

describe('Phase 130A §4 — cockpit bodies stay read-only after Copilot wiring', () => {
  for (const rel of COCKPIT_BODIES) {
    it(`${rel} has no raw <button> / <form> / onClick / onSubmit (panel encapsulates them)`, () => {
      const src = stripComments(read(rel));
      expect(src).not.toMatch(/<button\b/i);
      expect(src).not.toMatch(/<form\b/i);
      expect(src).not.toMatch(/\bonClick\b/);
      expect(src).not.toMatch(/\bonSubmit\b/);
    });
  }

  it('DealCopilotAssist itself adds no raw write affordance (delegates to the panel)', () => {
    const src = stripComments(read('copilot/DealCopilotAssist.tsx'));
    expect(src).not.toMatch(/<button\b/i);
    expect(src).not.toMatch(/<form\b/i);
    expect(src).not.toMatch(/\bonClick\b/);
    expect(src).not.toMatch(/\bonSubmit\b/);
  });
});

// ---------------------------------------------------------------------------
// §5 — Phase 130B polish stays honest + discoverable
// ---------------------------------------------------------------------------

describe('Phase 130B §5 — polish is discoverable and still not-configured-first', () => {
  it('the deal cockpit opens the assistant expanded (defaultExpanded)', () => {
    const src = read('copilot/DealCopilotAssist.tsx');
    expect(src).toMatch(/defaultExpanded/);
  });

  it('the panel carries a visible accent + a status pill that names the not-configured state', () => {
    const src = read('copilot/CopilotAssistPanel.tsx');
    // Discoverability: a Card accent stripe.
    expect(src).toMatch(/accentColor=\{palette\.cobalt\}/);
    // Honest status pill text driven by the adapter mode.
    expect(src).toMatch(/Not configured/);
    expect(src).toMatch(/Copilot connector not configured/);
  });

  it('the live "Connected" pill is gated on a non-not_configured adapter (never shown by default)', () => {
    const src = stripComments(read('copilot/CopilotAssistPanel.tsx'));
    // The "Connected" label only renders in the live branch; the default
    // adapter is not_configured, so it cannot appear today.
    expect(src).toMatch(/notConfigured\s*\?\s*'Not configured'\s*:\s*'Connected'/);
  });
});
