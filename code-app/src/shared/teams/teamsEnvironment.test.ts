import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  __resetTeamsEnvironmentForTests,
  buildTeamsChatDeepLink,
  getTeamsContextSafely,
  initializeTeamsContext,
} from './teamsEnvironment';

/**
 * Phase 86 — Teams environment helper tests.
 *
 * Pins:
 *   - buildTeamsChatDeepLink: pure URL builder; null on bad inputs;
 *     proper percent-encoding; optional topic + message omitted when
 *     blank; well-known Microsoft deep-link host.
 *   - initializeTeamsContext: never throws; returns
 *     `{ kind: 'unavailable', reason }` when the SDK load fails OR
 *     when `app.initialize()` rejects OR when getContext rejects.
 *     Returns `{ kind: 'available', context: ... }` on success and
 *     reads the diagnostic-only host fields.
 *   - Caching: repeated calls return the memoized result; the
 *     synchronous accessor matches the last resolved value; reset
 *     helper clears cache for tests.
 *   - Module hygiene: source contains no Graph / MSAL / calendar /
 *     notification / "sent / delivered / synced / posted" vocabulary
 *     and does not import from a role module.
 */

vi.mock('@microsoft/teams-js', () => ({
  app: {
    initialize: vi.fn(),
    getContext: vi.fn(),
  },
}));

import { app as teamsApp } from '@microsoft/teams-js';

const initializeMock = vi.mocked(teamsApp.initialize);
const getContextMock = vi.mocked(teamsApp.getContext);

beforeEach(() => {
  __resetTeamsEnvironmentForTests();
  vi.clearAllMocks();
});

describe('Phase 86 — buildTeamsChatDeepLink (pure)', () => {
  it('returns the well-known Microsoft Teams deep-link host', () => {
    const url = buildTeamsChatDeepLink({ userEmail: 'banker@bank.example' });
    expect(url).not.toBeNull();
    expect(url!.startsWith('https://teams.microsoft.com/l/chat/0/0?')).toBe(
      true,
    );
  });

  it('encodes the target email in the users= param', () => {
    const url = buildTeamsChatDeepLink({ userEmail: 'banker@bank.example' });
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('users')).toBe('banker@bank.example');
  });

  it('trims surrounding whitespace from the email before validating', () => {
    const url = buildTeamsChatDeepLink({
      userEmail: '   banker@bank.example   ',
    });
    expect(url).not.toBeNull();
    expect(new URL(url!).searchParams.get('users')).toBe(
      'banker@bank.example',
    );
  });

  it('returns null for an empty email', () => {
    expect(buildTeamsChatDeepLink({ userEmail: '' })).toBeNull();
    expect(buildTeamsChatDeepLink({ userEmail: '   ' })).toBeNull();
  });

  it('returns null for an email that is missing @ or domain dot', () => {
    expect(buildTeamsChatDeepLink({ userEmail: 'not-an-email' })).toBeNull();
    expect(buildTeamsChatDeepLink({ userEmail: 'foo@bar' })).toBeNull();
    expect(buildTeamsChatDeepLink({ userEmail: '@bar.example' })).toBeNull();
    expect(buildTeamsChatDeepLink({ userEmail: 'foo@bar.' })).toBeNull();
  });

  it('returns null for an email with embedded whitespace', () => {
    expect(
      buildTeamsChatDeepLink({ userEmail: 'banker @bank.example' }),
    ).toBeNull();
  });

  it('returns null for an email with more than one @', () => {
    expect(
      buildTeamsChatDeepLink({ userEmail: 'a@b@bank.example' }),
    ).toBeNull();
  });

  it('omits topic from the URL when not provided', () => {
    const url = buildTeamsChatDeepLink({ userEmail: 'banker@bank.example' });
    expect(new URL(url!).searchParams.has('topic')).toBe(false);
  });

  it('omits topic from the URL when only whitespace', () => {
    const url = buildTeamsChatDeepLink({
      userEmail: 'banker@bank.example',
      topic: '   ',
    });
    expect(new URL(url!).searchParams.has('topic')).toBe(false);
  });

  it('includes topic when provided and trims it', () => {
    const url = buildTeamsChatDeepLink({
      userEmail: 'banker@bank.example',
      topic: '  Hot Deal — Q2 funding  ',
    });
    expect(new URL(url!).searchParams.get('topic')).toBe(
      'Hot Deal — Q2 funding',
    );
  });

  it('omits message from the URL when not provided', () => {
    const url = buildTeamsChatDeepLink({ userEmail: 'banker@bank.example' });
    expect(new URL(url!).searchParams.has('message')).toBe(false);
  });

  it('includes message when provided and trims it', () => {
    const url = buildTeamsChatDeepLink({
      userEmail: 'banker@bank.example',
      message: '  Re: Hot Deal — checking on PFS  ',
    });
    expect(new URL(url!).searchParams.get('message')).toBe(
      'Re: Hot Deal — checking on PFS',
    );
  });

  it('percent-encodes special characters in topic and message', () => {
    const url = buildTeamsChatDeepLink({
      userEmail: 'banker@bank.example',
      topic: 'A & B',
      message: 'q=1&r=2',
    });
    // URLSearchParams encodes '&' as '%26', '=' as '%3D'
    expect(url!).toContain('topic=A+%26+B');
    expect(url!).toContain('message=q%3D1%26r%3D2');
    // Round-trip through URL parsing recovers the original strings.
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('topic')).toBe('A & B');
    expect(parsed.searchParams.get('message')).toBe('q=1&r=2');
  });

  it('encodes a target email containing an unusual but valid local part', () => {
    const url = buildTeamsChatDeepLink({
      userEmail: 'first.last+deal@bank.example',
    });
    expect(url).not.toBeNull();
    expect(new URL(url!).searchParams.get('users')).toBe(
      'first.last+deal@bank.example',
    );
  });
});

describe('Phase 86 — initializeTeamsContext (SDK probe)', () => {
  it('returns available when initialize + getContext both resolve', async () => {
    initializeMock.mockResolvedValue(undefined);
    getContextMock.mockResolvedValue({
      app: {
        host: { name: 'teams', clientType: 'web' },
        locale: 'en-us',
      },
      user: { tenant: { id: 'tenant-123' } },
    } as unknown as Awaited<ReturnType<typeof teamsApp.getContext>>);
    const result = await initializeTeamsContext();
    expect(result.kind).toBe('available');
    if (result.kind === 'available') {
      expect(result.context.hostName).toBe('teams');
      expect(result.context.hostClientType).toBe('web');
      expect(result.context.appLocale).toBe('en-us');
      expect(result.context.tenantId).toBe('tenant-123');
    }
  });

  it('returns unavailable with reason not-running-in-teams when initialize rejects', async () => {
    initializeMock.mockRejectedValue(new Error('not in teams'));
    const result = await initializeTeamsContext();
    expect(result).toEqual({
      kind: 'unavailable',
      reason: 'not-running-in-teams',
    });
  });

  it('returns unavailable with reason context-unavailable when getContext rejects', async () => {
    initializeMock.mockResolvedValue(undefined);
    getContextMock.mockRejectedValue(new Error('no context'));
    const result = await initializeTeamsContext();
    expect(result).toEqual({
      kind: 'unavailable',
      reason: 'context-unavailable',
    });
  });

  it('never throws — even when both SDK calls reject', async () => {
    initializeMock.mockRejectedValue('opaque non-error rejection');
    await expect(initializeTeamsContext()).resolves.toBeDefined();
  });

  it('does not break when host returns a partial context (missing app/user)', async () => {
    initializeMock.mockResolvedValue(undefined);
    // Cast through unknown because we are deliberately handing the
    // helper an under-shape; the helper must tolerate it.
    getContextMock.mockResolvedValue(
      {} as Awaited<ReturnType<typeof teamsApp.getContext>>,
    );
    const result = await initializeTeamsContext();
    expect(result.kind).toBe('available');
    if (result.kind === 'available') {
      expect(result.context.hostName).toBeUndefined();
      expect(result.context.hostClientType).toBeUndefined();
      expect(result.context.appLocale).toBeUndefined();
      expect(result.context.tenantId).toBeUndefined();
    }
  });
});

describe('Phase 86 — caching + sync accessor', () => {
  it('returns null from getTeamsContextSafely before initializeTeamsContext has resolved', () => {
    expect(getTeamsContextSafely()).toBeNull();
  });

  it('returns the resolved value from getTeamsContextSafely after initialize completes', async () => {
    initializeMock.mockResolvedValue(undefined);
    getContextMock.mockResolvedValue({
      app: { host: { name: 'office' } },
    } as unknown as Awaited<ReturnType<typeof teamsApp.getContext>>);
    await initializeTeamsContext();
    const cached = getTeamsContextSafely();
    expect(cached?.kind).toBe('available');
  });

  it('memoizes — a second call does not re-invoke the SDK', async () => {
    initializeMock.mockResolvedValue(undefined);
    getContextMock.mockResolvedValue({
      app: { host: { name: 'teams' } },
    } as unknown as Awaited<ReturnType<typeof teamsApp.getContext>>);
    await initializeTeamsContext();
    await initializeTeamsContext();
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(getContextMock).toHaveBeenCalledTimes(1);
  });

  it('memoizes the unavailable result as well (failure mode is sticky)', async () => {
    initializeMock.mockRejectedValue(new Error('not in teams'));
    const first = await initializeTeamsContext();
    const second = await initializeTeamsContext();
    expect(first).toEqual(second);
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it('concurrent in-flight calls share one probe', async () => {
    initializeMock.mockResolvedValue(undefined);
    getContextMock.mockResolvedValue({
      app: { host: { name: 'teams' } },
    } as unknown as Awaited<ReturnType<typeof teamsApp.getContext>>);
    const [a, b, c] = await Promise.all([
      initializeTeamsContext(),
      initializeTeamsContext(),
      initializeTeamsContext(),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(initializeMock).toHaveBeenCalledTimes(1);
  });

  it('__resetTeamsEnvironmentForTests clears the cache (sync accessor returns null)', async () => {
    initializeMock.mockResolvedValue(undefined);
    getContextMock.mockResolvedValue({} as Awaited<
      ReturnType<typeof teamsApp.getContext>
    >);
    await initializeTeamsContext();
    expect(getTeamsContextSafely()).not.toBeNull();
    __resetTeamsEnvironmentForTests();
    expect(getTeamsContextSafely()).toBeNull();
  });
});

describe('Phase 86 — module hygiene (source-text guards)', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'teamsEnvironment.ts'),
    'utf8',
  );

  function stripComments(s: string): string {
    return s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  const CODE = stripComments(SRC);

  it('imports only the Teams SDK (no Graph / MSAL / calendar / Office connectors)', () => {
    expect(CODE).not.toMatch(/from\s+['"]@microsoft\/microsoft-graph-client['"]/);
    expect(CODE).not.toMatch(/from\s+['"]@azure\/msal-browser['"]/);
    expect(CODE).not.toMatch(/from\s+['"]@microsoft\/microsoft-graph-types['"]/);
    expect(CODE).not.toMatch(/from\s+['"][^'"]*Graph[^'"]*['"]/);
    expect(CODE).not.toMatch(/from\s+['"][^'"]*Calendar[^'"]*['"]/);
    expect(CODE).not.toMatch(/from\s+['"][^'"]*Office365[^'"]*['"]/);
  });

  it('imports no role module (banker / manager / team / deals / executive / admin)', () => {
    const imports = SRC.match(/from\s+['"][^'"]+['"]/g) ?? [];
    for (const imp of imports) {
      expect(imp).not.toMatch(
        /\/(banker|manager|team|deals|executive|admin)\//,
      );
    }
  });

  it('does not contain affirmative send / sync / post / notify vocabulary as a positive claim', () => {
    // Phase 86 brief forbids these tokens in source. Comment text is
    // stripped first so prose like "// the app never sends" passes.
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+sent\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+delivered\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+synced\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+posted\b/i);
    expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+notified\b/i);
    expect(CODE).not.toMatch(/\bmeeting\s+created\b/i);
    expect(CODE).not.toMatch(/\bcalendar\s+updated\b/i);
    expect(CODE).not.toMatch(/\bTeams\s+integrated\b/i);
    expect(CODE).not.toMatch(/\bGraph\s+connected\b/i);
  });

  it('contains no Graph token, OAuth, or secret-acquisition vocabulary', () => {
    expect(CODE).not.toMatch(/getAuthToken|authentication\.getAuthToken/i);
    expect(CODE).not.toMatch(/access[_-]?token/i);
    expect(CODE).not.toMatch(/client[_-]?secret/i);
    expect(CODE).not.toMatch(/oauth/i);
  });
});
