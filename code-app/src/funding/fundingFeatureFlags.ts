/**
 * final-seven-workstreams Workstream 7 — the funding-authorization capability gate. Matches this
 * codebase's established default-off, hard-coded-constant convention (see
 * `src/deals/dealOriginationFeatureFlags.ts`). PR 111 mounted DealFundingAuthorizationPanel
 * local-only (createInMemoryFundingAuthorizationStore() — real dual-control policy logic, honestly
 * disclosed as session-scoped; see DealFundingAuthorizationPanel.tsx's doc comment), so the gate now
 * reflects that real reference-implementation mount. It stays a distinct capability flag (rather
 * than deleting it) because it is still false for LIVE Dataverse persistence — no
 * cr664_fundingauthorization table exists yet (see
 * scripts/schema-migrations/pr107-funding-authorization/*.mjs).
 */
export const FUNDING_AUTHORIZATION_ENABLED = true as const;
