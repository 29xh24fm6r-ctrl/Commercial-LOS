# PR123 — Closing Document Persistence: Schema Proposal

Factory Arc Phase 11 of the Post-PR111 Live Activation and Audit Remediation Factory Arc: "Closing
document persistence."

## Starting point

Confirmed by direct inspection (not by trusting the prior doc): `src/closing/documents/
closingDocumentStorage.ts`'s `createInMemoryClosingDocumentStore()` is the store currently mounted in
`DealClosingDocumentsPanel.tsx`. It is real and working — generation, eligibility checks, audit
recording, and the immutable-manifest/supersession model (`closingDocumentGeneration.ts`) all function
correctly — but the store itself is explicitly session-only (`closingDocumentStorage.ts`'s own header
comment says so) and is lost on page reload. This is already tracked as `platformInventory.ts`'s
`closing-document-persistence` NOT_WIRED entry (`blockerKind: 'schema'`), and this arc's own Phase 9
investigation confirmed it is correctly scoped to Phase 11, not re-litigated there.

Unlike PR105/PR106's single-valued deal facts (financial spread inputs, risk rating inputs), a
generated closing document is an **immutable, append-only history** — a deal can accumulate many
manifests over time, and regeneration always creates a brand-new row with `supersedesManifestId`
rather than mutating a prior one (`closingDocumentGeneration.ts`'s `regenerateClosingDocument`). That
shape rules out an additive JSON column on `cr664_loandeal` the way PR105/PR106 modeled single-valued
facts: a deal-level blob can only ever hold one value, never a growing history. Real persistence needs
its own table.

## Why no schema proposal existed until now

Checked `scripts/schema-migrations/` for a prior closing-document proposal — none existed. `pr105-loan-
structure`, `pr106-risk-rating`, `pr107-funding-authorization`, and `pr113-credit-memo-fulltext` all
have complete migration bundles; closing documents did not, despite the gap being tracked since PR 107.

## What this phase built

A complete, reviewed-but-**not-yet-applied** schema migration bundle,
`scripts/schema-migrations/pr123-closing-document-persistence/`, mirroring the `pr107-funding-
authorization` bundle's exact structure and helper functions (`entity.mjs`'s `requireEnv`/`apiBase`/
`authHeaders`, `create-entity.mjs`'s idempotent entity-then-columns two-phase create, `verify-
entity.mjs`'s presence check, `rollback-entity.mjs`'s dry-run-by-default delete):

**Proposed table: `cr664_closingdocumentmanifest`** (primary attribute `cr664_manifestid`), one row per
generated manifest, matching `GeneratedClosingDocumentManifest`
(`src/closing/documents/closingDocumentTypes.ts`) field-for-field, plus the rendered document content
itself stored alongside its manifest row (no separate content table — a manifest is immutable and
never mutated after creation, so there is no versioning concern a split table would solve, and keeping
content next to its manifest means one row read reconstructs one document completely):

| Column | Type | Source field |
|---|---|---|
| `cr664_manifestid` (primary) | String | `manifestId` |
| `cr664_dealid` | String | `dealId` |
| `cr664_templatekey` | String | `templateKey` |
| `cr664_templateversion` | String | `templateVersion` |
| `cr664_generatedatiso` | DateTime | `generatedAtIso` |
| `cr664_generatedbyactoremail` | String | `generatedByActorEmail` |
| `cr664_contenthash` | String | `contentHash` |
| `cr664_correlationid` | String | `correlationId` |
| `cr664_status` | String | `status` (`'draft'` \| `'final'`) |
| `cr664_supersedesmanifestid` | String | `supersedesManifestId` |
| `cr664_renderedcontent` | Memo (1,048,576 char) | the rendered document text itself |

`cr664_dealid` is a plain string column for now, not yet a Lookup relationship — matching the exact
precedent `pr107-funding-authorization` already set for the same "per-deal history" shape (its own
`create-entity.mjs` defers the Lookup relationship to a manual Maker Portal step, since relationship
creation via the Web API is a separate, more involved call).

## What this phase deliberately did NOT do

Did **not** hand-author a fake "generated" SDK model/service file for this table the way PR 112 did
for Funding Authorization. That precedent — disclosed honestly at the time, but flagged by this arc's
own mission scope as needing reconciliation — is exactly why Phase 11 stops at the schema proposal
rather than repeating it. Fabricating generated-shaped files for a table that has zero live existence
is a bigger step than proposing the schema for operator review, and doing so without a fresh, explicit
authorization for this specific table risks compounding the exact class of drift this whole
remediation arc exists to close. See `docs/factory-arc/PR122_FUNDING_AUTHORIZATION_SDK_REGENERATION_
ESCALATION.md` for Phase 10's finding on the PR 112 precedent.

Also did not touch `closingDocumentStorage.ts`, `closingDocumentGeneration.ts`,
`DealClosingDocumentsPanel.tsx`, or any generated SDK file — the in-memory store remains correctly
mounted and the "not yet saved" governance stays accurate until an operator actually applies this
schema and a genuine live adapter is written against a real regeneration.

## Operator procedure (once ready to proceed)

```bash
# 1. Apply the schema (creates the entity + all 10 columns, idempotently):
DATAVERSE_URL=https://org3a57b8d4.crm.dynamics.com DATAVERSE_ACCESS_TOKEN=... \
  node scripts/schema-migrations/pr123-closing-document-persistence/create-entity.mjs

# 2. Confirm it landed:
DATAVERSE_URL=https://org3a57b8d4.crm.dynamics.com DATAVERSE_ACCESS_TOKEN=... \
  node scripts/schema-migrations/pr123-closing-document-persistence/verify-entity.mjs
```

```powershell
# 3. Regenerate the SDK for real (power.config.json does not yet register this data source --
#    that registration itself is part of the follow-up adapter-wiring phase, not this proposal):
pac code add-data-source -a dataverse -t cr664_closingdocumentmanifest
```

```bash
# 4. Only after steps 1-3 produce a genuine generated model/service, write
#    createDataverseClosingDocumentStore() (a new src/closing/documents/ adapter implementing
#    ClosingDocumentStorageDeps) against the real generated service, following the fail-closed,
#    try/catch-everywhere convention fundingAuthorizationDataverseStore.ts already established for
#    the identical "per-deal append-only history" shape. That adapter is a separate, later phase's
#    work, not this one's.
```

## Status

**Still NOT_WIRED.** `blockerKind: 'schema'`, unchanged. The in-memory store remains the correctly
disclosed, correctly mounted implementation until an operator applies this schema and a real adapter
is built against a genuine regeneration.

Full validation run in this sandbox before closing out this phase:

- `npx tsc -b` — 0 errors
- `npx vitest run src/shared/governance/platformInventory.test.ts` — 88 passed (includes the new
  regression test pinning this doc's cross-reference)
- Full `vitest run` / `npm run build` / `npm run audit:reachability` deferred to a later batched
  checkpoint per the current speed-up directive; no runtime `src/` file was touched, so no regression
  is expected there. The new `.mjs` scripts are plain Node scripts outside the Vite/TypeScript build
  graph (matching every other `scripts/schema-migrations/*` bundle), so they do not affect
  `audit:reachability`.
