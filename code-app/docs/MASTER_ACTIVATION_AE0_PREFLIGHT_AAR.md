# AE-0 — Read-Only Activation Preflight (AAR)

**Spec:** OGB LOS — MASTER ACTIVATION SPEC (single source of truth)
**Scope of this session:** AE-0 only — read-only preflight. **No flags flipped, no live writes.**
**Verdict: PASS — safe to proceed to AE-1 (portfolio boarding) as a discrete session, after operator sign-off.**

---

## 1. Crash fix (PE-0A) — DEPLOYED

The live Command Center crash `0x80060888` on `cr664_extendedloanattributes` is fixed and on the live read surface.

- **Safe parse:** `src/portfolioBoarding/extendedLoanAttributes.ts` — `EXTENDED_LOAN_ATTRIBUTES_COLUMN = 'cr664_extendedloanattributes'`; the parse "returns null on absent / malformed / wrong-version data" (fail-closed; never throws on a missing column).
- **Composed into the LIVE read path** (not `intentionallyUnrouted`):
  `extendedLoanAttributes.ts` → `boardedLoansList.ts` → `ExistingPortfolioLoansPanel.tsx` → mounted by **`PortfolioCommandCenter.tsx`** and **`BankerLoanWorkflowTab.tsx`** (both live surfaces).
- **Deployment:** committed to master as `1b9807a` ("Launch Phase 2: extended-attributes persistence"); shipped in last turn's `pac code push` of master. Crash is gone on live.

## 2. Runtime read path for each domain's flag

Both domains read flags through a **config resolver** at runtime — NOT the static display consts.

- **Portfolio:** static `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false` / `PORTFOLIO_BOARDING_ROUTE_ENABLED = false` (`portfolioLoanBoardingFeatureFlags.ts:43-44`) are the fail-closed defaults. The runtime resolver derives from a passed `config` object: `config?.livePersistenceEnabled === true`, `config?.routeEnabled === true` (+ `documentMetadataEnabled`, `commandCenterEnabled`, `fdicPackageEnabled`).
- **CRM:** same shape — `crmAdminControlModel.ts` derives `livePersistenceEnabled = persistenceGate.satisfied`; `crmFeatureFlags.ts` exports the static `CRM_*_ENABLED` display consts.

> **Activation implication:** CC must set **enabled config in the path the running app reads** (the config object the resolver consumes), not merely flip the static display const.

## 3. Composition points — the 4-part gate is BUILT but NOT WIRED

Each live-persistence resolver returns the LIVE adapter only when ALL hold: (1) enabled flags config, (2) hydrated `VerifiedSchemaState`, (3) authorized operator, (4) injected Dataverse client. Confirmed in `resolvePortfolioLoanBoardingRuntimeAdapter` — pure, fail-closed, no default client.

**These resolvers are NOT composed into the live runtime** — listed in `src/navigation/intentionallyUnrouted.ts` as "WIRE candidate, Phase 3+":
- Portfolio: lines 304-306 (`resolvePortfolioLoanBoardingAdapter.ts`, `resolvePortfolioLoanBoardingPersistenceAdapter.ts`, `usePortfolioLoanBoardingPersistence.ts`)
- CRM: lines 150 (`crmLiveDataverseAdapter.ts`), 184 (`resolveCrmPersistenceAdapter.ts`)

Grep found **no live call site** for the portfolio runtime resolver outside tests/comments.

> **Activation = bounded wiring:** compose the already-built resolver at a composition root, passing enabled config + the hydrated verified state + operator identity + injected client. No new adapter logic required.

## 4. Hydration — PASS for both domains (committed evidence)

`src/admin/runtimeVerifiedSchemaBridge.ts` holds committed PASS evidence that hydrates runtime verified state. **Hydration is a prerequisite, NOT activation** — flags stay `false`, so no live write occurs.

| Domain | Status | Services | Data sources | Live tables | Measured | verifiedAtIso |
|---|---|---|---|---|---|---|
| Portfolio (`CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE`) | PASS | 13/13 | 13/13 | 13/13 | 13 tables / 219 cols / 12 req + 6 opt rel / conflicts 0 | 2026-06-25T16:00:29 |
| CRM (`CURRENT_CRM_VERIFICATION_EVIDENCE`) | PASS | 10/10 | 10/10 | 10/10 | 10 tables / 147 cols / conflicts 0 | 2026-06-25T14:25:05 |

Backed by `runtime-schema-evidence.portfolio.json` (same values).

---

## AE-0 exit criteria (per spec)

- [x] Crash gone (PE-0A composed on live read path + deployed)
- [x] Read-path documented per domain (config resolver, not static const)
- [x] Composition points documented (resolvers built, unrouted — activation is bounded wiring)
- [x] Hydration still PASS (Portfolio + CRM)
- [x] **Nothing flipped**

## Next (do NOT start without operator go)

**AE-1 — Portfolio boarding live persistence (top priority), as its own CC session:**
1. Compose `resolvePortfolioLoanBoardingRuntimeAdapter` at a composition root with enabled config + hydrated portfolio verified state + authorized operator + injected client.
2. Gate green: `tsc -b` clean + full `vitest run` green BEFORE push.
3. Controlled **single-record** boarding smoke → verify audit row → then broader use.
4. AE-1 AAR. Rollback stays a one-line flip of the config back to `false` (non-destructive).
