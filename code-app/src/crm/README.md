# CRM subsystem — what is live, what is deferred

This directory contains **two** CRM stacks. They look similar; only one is live. Read this
before assuming a module writes real data. (Grounded by the CRM audit; the single honest
readiness view is `readiness/unifiedCrmReadiness.ts`.)

> Final disposition of every audit finding — what's fixed, and why the deferred items are
> deliberately kept/backlogged: [`docs/CRM_AUDIT_CLOSEOUT.md`](../../docs/CRM_AUDIT_CLOSEOUT.md).

## The LIVE path (what users actually touch)

- **Writes:** `write/crmWriteAdapter.ts` (add company / contact / activity / task / relationship)
  and `write/crmUpdateAdapter.ts` (governed inline field edit), consumed by
  `workspace/CrmWriteActions.tsx` + `workspace/CrmOrgFieldInlineEdit.tsx` inside
  `workspace/CrmHubWorkspace.tsx`, which is mounted in the banker workspace.
  - Governed discipline: fail-closed auth → validation → resolved Dataverse identity → create →
    **readback** → CRM audit → discriminated outcome. Live SDK deps are built by
    `buildLiveCrmWriteDeps` / `buildLiveCrmUpdateDeps` (dynamic-import the generated `Cr664_crm*`
    services).
  - **Identity-gated and flag-INDEPENDENT** — it does **not** read `CRM_LIVE_PERSISTENCE_ENABLED`.
- **Reads:** `workspace/crmWorkspaceData.ts` (the 10 `cr664_crm*` tables, null-safe, per-domain
  fail-closed) and `intelligence/loadCrmIntelligence.ts` (NAICS concentration / advisor map —
  routed only behind `CRM_INTELLIGENCE_ROUTE_ENABLED`).
- **New-deal → CRM client linkage:** delivered by `../deals/newDealCreateAdapter.ts` (fails closed
  with `client_required`; verifies the bound client via `link_readback_mismatch`), enforced by
  `../deals/dealOriginationOrchestrator.ts`. (The `linkage/newDealCrmClientLinkage.ts` decision
  model is **not** wired — do not treat it as the source of truth.)

### Known live-path gaps (see the audit)
- Create covers **6 of 10** `cr664_crm*` entities; edit covers **organizations only**.
- No governed **delete**; no edit for person / contact-point / relationship / timeline.
- Four entities have **no live write path**: role assignments, communication preferences, contact
  authorizations, vendor profiles.

## The DEFERRED / inert stack — NOT the live path

Do not mistake these for the write path. They are gated off, unrouted, and constructed only by
tests. Retiring or wiring them is a deliberate, reviewed decision — not "almost live" today.

- **Persistence spine:** `resolveCrmPersistenceAdapter.ts`, `crmWritebackAdapter.ts`,
  `crmLiveDataverseAdapter.ts`, `crmLiveDataverseTransport.ts`, `../activation/crmActivation.ts`,
  and `writeback/*`. Gated by `crmFeatureFlags.CRM_LIVE_PERSISTENCE_ENABLED = false`, no transport
  is injected in production, and every constructor is called only from `*.test.ts`.
  `unifiedCrmReadiness` reconciles it off explicitly ("no parallel readiness story").
- **Salesforce / nCino / sync / source-of-truth lanes:** `crmSalesforceSpine*`, `salesforceLane/`,
  `ncinoLane/`, `syncPreview/`, `sourceOfTruth/`. These are a Salesforce **metaphor over the
  internal `cr664_crm*` tables** — there is **no external Salesforce/nCino API dependency**
  (test-pinned). Read-only preview view-models, mostly listed in
  `../navigation/intentionallyUnrouted.ts` as WIRE candidates.
  - Caveat before deleting: the **type/model layer** (`crmSalesforceSpineModel.ts` →
    `CrmSpineEntityKey`) is load-bearing (imported by live view-models + `seed/crmCanonicalSeedReadiness`).
    A retirement must extract those types first, then delete the unrouted consoles/orchestrators.

## Flags & schema (why the flag is a red herring)

- `CRM_LIVE_PERSISTENCE_ENABLED` gates the **inert spine**, not the live Hub. Flipping it lights a
  redundant, unrouted path — it does not enable CRM writes (those are already live via the Hub).
- Schema contract: **10 tables / 147 columns / 28 relationships / 0 conflicts**, verified by the
  committed token-backed evidence in `../admin/runtimeVerifiedSchemaBridge.ts`. The `verifiedAtIso`
  date is surfaced in the readiness UI; **re-verify against the live environment** if the schema may
  have changed — the runtime freshness guard only fires when a caller supplies a clock.
- Seed: no canonical `cr664_crm*` records are seeded yet; the governed backfill path is defined but
  operator-run. "Backfill path ready" ≠ "records exist".
