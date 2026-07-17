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
  routed only behind `CRM_INTELLIGENCE_ROUTE_ENABLED`; the CRM Hub now surfaces a visible
  "Industry & advisor intelligence" link to `/surfaces/crm-intelligence` next to its view tabs, so
  the route is discoverable once its flag is verified live and flipped).
- **Relationship health + rollups (CRM-ELITE-1):** `workspace/crmRelationshipHealthData.ts` derives
  one `CrmHealthInput` per organization and `CrmAccountRollupRecord[]` from the SAME already-loaded
  `CrmWorkspaceData` — zero new reads. A domain that failed to load leaves its input field
  `undefined` (honestly unknown), never `0` (an evidenced zero). Consumed by:
  - `workspace/CrmHubWorkspace.tsx` — a real `CrmRelationshipHealthCard` in the record detail
    drawer + a real team `CrmRelationshipRollups` above the record table, behind
    `CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED` (default off).
  - `workspaceIntegration/crmWorkspaceRollupInputs.ts` — replaces the hardcoded manager/executive
    strip (`workspaceIntegration/crmWorkspacePreviewInputs.ts`'s `managerCrmPreviewInput` /
    `executiveCrmPreviewInput`, kept in place only as the flag-off fallback) with real rollup-derived
    copy and counts, behind `CRM_LIVE_ROLLUPS_ENABLED` (default off). The old "SoT Conflicts" /
    "Intelligence Gaps" fields were retired and renamed `accountsNeedingAttention` (a real at-risk
    account count) rather than silently repurposed under their old, now-inaccurate label.
  - `dailyActions/deriveLiveBankerCrmDailyActionInput.ts` — populates the banker daily action queue
    (`dailyActions/BankerCrmDailyActionQueue.tsx`, mounted at the top of the CRM Hub's Companies
    view) with ONLY the two categories backed by a real signal (missing contacts, activity gaps).
    The five Salesforce/nCino-metaphor-lane categories are hard-pinned to empty arrays — behind
    `CRM_DAILY_ACTION_QUEUE_ENABLED` (default off).
  - Known schema gap: `overdueTaskCount` is always `undefined` —
    `cr664_crmtimelineevents` has no status/completed field, so overdue detection has no live signal
    behind it today. This is a gap, not a bug; do not fabricate it.
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
