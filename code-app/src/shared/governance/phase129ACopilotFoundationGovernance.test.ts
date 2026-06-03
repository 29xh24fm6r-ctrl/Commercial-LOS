import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 129A — Copilot foundation governance pins.
 *
 * Proves the Copilot subsystem obeys the security model:
 *   1. Context builders only expose already-authorized data fields
 *   2. No write functions exist on the adapter interface
 *   3. not_configured adapter is honest (no fake AI)
 *   4. No cross-team data access paths
 *   5. No external network calls in not_configured mode
 *   6. UI components render disabled/not-configured state
 */

const REPO_SRC = resolve(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_SRC, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// §1 — Adapter source contains no write verbs
// ---------------------------------------------------------------------------

describe('Phase 129A §1 — adapter has no write capabilities', () => {
  const adapterSrc = readSrc('copilot/copilotAssistantAdapter.ts');

  it('adapter source has no Dataverse write imports', () => {
    expect(adapterSrc).not.toMatch(/\.create\(/);
    expect(adapterSrc).not.toMatch(/\.update\(/);
    expect(adapterSrc).not.toMatch(/\.delete\(/);
    expect(adapterSrc).not.toMatch(/\.patch\(/);
  });

  it('adapter source does not import any generated service', () => {
    expect(adapterSrc).not.toMatch(/from ['"]\.\.\/generated\//);
  });

  it('adapter source does not import fetch or axios', () => {
    expect(adapterSrc).not.toMatch(/\bfetch\b/);
    expect(adapterSrc).not.toMatch(/\baxios\b/);
    expect(adapterSrc).not.toMatch(/\bXMLHttpRequest\b/);
  });

  it('adapter interface methods are all read-only summaries', () => {
    expect(adapterSrc).toContain('summarizeDeal');
    expect(adapterSrc).toContain('summarizeWorkspace');
    expect(adapterSrc).toContain('suggestNextActions');
    expect(adapterSrc).toContain('explainMissingFields');
    expect(adapterSrc).toContain('explainBlockers');
    // No write verbs
    expect(adapterSrc).not.toMatch(/\bapproveLoan\b/);
    expect(adapterSrc).not.toMatch(/\bsendEmail\b/);
    expect(adapterSrc).not.toMatch(/\bcompleteTask\b/);
    expect(adapterSrc).not.toMatch(/\brequestDocument\b/);
    expect(adapterSrc).not.toMatch(/\bcreateRecord\b/);
  });
});

// ---------------------------------------------------------------------------
// §2 — Context builders only consume authorized data shapes
// ---------------------------------------------------------------------------

describe('Phase 129A §2 — context builders are data-safe', () => {
  const dealCtxSrc = readSrc('copilot/dealCopilotContext.ts');
  const workspaceCtxSrc = readSrc('copilot/workspaceCopilotContext.ts');

  it('dealCopilotContext does not import any generated service', () => {
    expect(dealCtxSrc).not.toMatch(/from ['"]\.\.\/generated\//);
  });

  it('dealCopilotContext does not call any load/fetch function', () => {
    expect(dealCtxSrc).not.toMatch(/\bload[A-Z]/);
    expect(dealCtxSrc).not.toMatch(/\bfetch[A-Z]/);
    expect(dealCtxSrc).not.toMatch(/\bawait\b/);
    expect(dealCtxSrc).not.toMatch(/\basync\b/);
  });

  it('workspaceCopilotContext does not import any generated service', () => {
    expect(workspaceCtxSrc).not.toMatch(/from ['"]\.\.\/generated\//);
  });

  it('workspaceCopilotContext does not call any load/fetch function', () => {
    expect(workspaceCtxSrc).not.toMatch(/\bload[A-Z]/);
    expect(workspaceCtxSrc).not.toMatch(/\bfetch[A-Z]/);
    expect(workspaceCtxSrc).not.toMatch(/\bawait\b/);
    expect(workspaceCtxSrc).not.toMatch(/\basync\b/);
  });
});

// ---------------------------------------------------------------------------
// §3 — not_configured adapter text is honest
// ---------------------------------------------------------------------------

describe('Phase 129A §3 — not_configured adapter honesty', () => {
  const adapterSrc = readSrc('copilot/copilotAssistantAdapter.ts');

  it('adapter contains the not_configured preamble', () => {
    expect(adapterSrc).toContain('Copilot connector is not configured');
  });

  it('adapter runtime code does not contain hallucinated AI claims', () => {
    // Strip block comments and line comments before checking, so
    // governance doc-comments that mention forbidden words as rules
    // (e.g. "NEVER claims probability") don't false-positive.
    const stripped = adapterSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(stripped).not.toMatch(/\bprobability\b/i);
    expect(stripped).not.toMatch(/\bapproval odds\b/i);
    expect(stripped).not.toMatch(/\bcredit score\b/i);
    expect(stripped).not.toMatch(/\brisk score\b/i);
  });
});

// ---------------------------------------------------------------------------
// §4 — UI components respect not-configured state
// ---------------------------------------------------------------------------

describe('Phase 129A §4 — UI components enforce not-configured state', () => {
  const panelSrc = readSrc('copilot/CopilotAssistPanel.tsx');
  const notConfigSrc = readSrc('copilot/CopilotNotConfiguredState.tsx');

  it('CopilotAssistPanel checks adapter.mode', () => {
    expect(panelSrc).toContain("adapter.mode === 'not_configured'");
  });

  it('CopilotAssistPanel renders CopilotNotConfiguredState', () => {
    expect(panelSrc).toContain('CopilotNotConfiguredState');
  });

  it('CopilotAssistPanel footer states read-only constraint', () => {
    expect(panelSrc).toMatch(/Cannot approve/);
    expect(panelSrc).toMatch(/change data/);
    expect(panelSrc).toMatch(/send communications/);
  });

  it('CopilotNotConfiguredState mentions administrator contact', () => {
    expect(notConfigSrc).toContain('Contact your administrator');
  });

  it('CopilotNotConfiguredState does not contain form inputs or buttons', () => {
    // The not-configured state is display-only
    expect(notConfigSrc).not.toMatch(/<button\b/);
    expect(notConfigSrc).not.toMatch(/<input\b/);
    expect(notConfigSrc).not.toMatch(/<form\b/);
  });
});

// ---------------------------------------------------------------------------
// §5 — No cross-team / cross-user data access
// ---------------------------------------------------------------------------

describe('Phase 129A §5 — no cross-team data leakage paths', () => {
  const allCopilotFiles = [
    'copilot/copilotAssistantAdapter.ts',
    'copilot/dealCopilotContext.ts',
    'copilot/workspaceCopilotContext.ts',
    'copilot/CopilotAssistPanel.tsx',
    'copilot/CopilotPromptBar.tsx',
    'copilot/CopilotResponseCard.tsx',
    'copilot/CopilotNotConfiguredState.tsx',
  ];

  for (const file of allCopilotFiles) {
    it(`${file} does not import from banker/team/manager providers`, () => {
      const src = readSrc(file);
      expect(src).not.toMatch(/from ['"]\.\.\/banker\/BankerContext['"]/);
      expect(src).not.toMatch(/from ['"]\.\.\/team\/TeamContext['"]/);
      expect(src).not.toMatch(/from ['"]\.\.\/manager\/ManagerContext['"]/);
    });
  }
});
