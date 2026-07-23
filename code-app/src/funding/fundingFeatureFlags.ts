/**
 * final-seven-workstreams Workstream 7 — the funding-authorization capability gate. Matches this
 * codebase's established default-off, hard-coded-constant convention (see
 * `src/deals/dealOriginationFeatureFlags.ts`). Disabled by default: this framework has no live
 * storage (see fundingAuthorizationStorage.ts) and no schema — flipping this before those exist
 * would gate a capability that cannot honestly do anything live yet.
 */
export const FUNDING_AUTHORIZATION_ENABLED = false as const;
