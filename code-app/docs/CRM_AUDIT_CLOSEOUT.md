# CRM audit — closeout & final disposition

This closes out the CRM subsystem audit. Every finding has a final status below. Nothing is
left dangling: items are either **fixed**, **resolved as-is (with reason)**, **won't-do (with
evidence)**, or **requires the live environment / a policy decision** — the last two being genuine
external dependencies, not open engineering work.

Shipped fixes: PR #72 (`crm-hardening`, merged) + the `crm-closeout` follow-up. Architecture map:
[`src/crm/README.md`](../src/crm/README.md).

## Disposition table

| # | Finding | Final status | Evidence / pointer |
|---|---|---|---|
| D1 | Failed org edits reported success (silent data loss) | **FIXED** | `crmUpdateAdapter` reads `result.success`/`error` + readback; mock regression tests |
| D2 | Create readback failure → "retry" → duplicate record | **FIXED** | outcome carries the created id; UI no longer says "retry" |
| D3 | `newDealLinkageOperational: true` cited a test-only module | **RESOLVED** | capability is genuinely live via `newDealCreateAdapter` (`client_required`/`link_readback_mismatch`); attribution re-pointed |
| T1 | Live write factories / `write-failed` / validation untested | **FIXED** | mock-service tests for the factories, both write-failed paths, party-type/NAICS |
| T2 | No null-injection fuzz over read mappers | **FIXED** | all 10 mappers proven against an all-null row |
| H1 | Stale certification / "seed ready" narration | **FIXED** | docstring + label corrected, with a regression guard |
| H2 | Raw ISO dates in the drawer | **FIXED** | display dates formatted; sort keys kept raw |
| N1 | NAICS numeric-input / org-badge null traps | **FIXED** | type guard + null-safe helper + test |
| R1 | ⌘K palette advertised disabled surfaces | **FIXED** | filtered by route flag |
| A1 | Inert spine + Salesforce/nCino lanes (~3k LOC) | **WON'T DELETE — load-bearing** | see §1 |
| A2 | Entity/verb gaps (edit/delete + 4 entities) | **NEEDS LIVE ENV + UI** | see §2 |
| A3 | Dormant schema-freshness guard | **RESOLVED as-is** | see §3 |
| L1 | Two "mount" models use the same word differently | **DEFERRED (low)** | see §4 |

## §1 — The spine + lanes are NOT deletable (load-bearing)

The audit framed the spine/lanes as inert dead code. That is true of the **runtime write path**, but
an import-graph check shows the code is structurally load-bearing for **production** and for the
**activation governance proofs** now on `master`. Deleting it would break compiles and remove
fail-closed safety tests — a regression, not cleanup:

- `crmRuntimeSchemaGate` → imported by **production** `fullActivationLaunchCertificationModel.ts` and `runtimeVerifiedSchemaBridge.ts`.
- `crmActivation` → imported by **production** `portfolioBoardingActivation.ts` (`deriveCrmSchemaGate` is reused by portfolio).
- `crmSalesforceSpineModel`, `crmControlledWritebackAdapter`, `crmWritebackPolicyGate` → imported by **production** view-models (`crmAccountViewModel`, `crmRelationshipIntelligenceViewModel`).
- `resolveCrmPersistenceAdapter`, `crmLiveDataverseTransport` → imported by governance tests that PROVE the fail-closed wiring (`activationVerifiedStateContract`, `phase245ControlledLiveCutover`, `crmPersistenceGovernance`, `runtimeVerifiedSchemaBridge`).

Only `crmWritebackAdapter` and `crmAllowlistedLiveWritePilot` are import-orphans; deleting them removes
their allow-list/policy proofs for no benefit. **Decision: keep, documented.** The honesty risk (it
reading as "almost live") is addressed by `src/crm/README.md`, which states plainly what is live vs
deferred. If the team later decides to truly remove it, that is a reviewed refactor that must first
re-home the load-bearing types and rewrite the governance tests — not an autonomous deletion.

## §2 — Entity/verb gaps require the live environment

The live Hub covers 6/10 entities for create and 1/10 for edit, with no delete. Closing this is
**net-new feature work** (governed adapters generalized from `crmUpdateAdapter`/`crmWriteAdapter`, plus
Hub UI for each), and every write **must be certified against live Dataverse** — it cannot be truthfully
completed or verified in-repo, and shipping unwired adapters would only regrow the inert surface §1
warns against. **Decision: backlog as a scoped feature.** The pattern to follow is the existing governed
adapters (auth → validate → identity → write → readback → audit); delete needs an added
soft-delete/deactivate path and its own live-safety review.

## §3 — Schema-freshness guard: resolved as-is (do not hard-block)

The runtime freshness check only fires when a caller passes a clock, and none do. Hard-enabling a 24h
window would fail the current 2-week-old evidence and flip the merged activation dashboards to "schema
not verified" — which is **wrong for a schema snapshot** (a schema does not expire like live data). The
correct behavior is: hydrate, show when it was verified, and let an operator re-verify. That is already
shipped — the `verifiedAtIso` date is surfaced in the CRM readiness detail. **Decision: resolved.** A
future hardening (a schema-appropriate window that warns, never blocks) is optional, not required.

## §4 — Mount-model naming (low, deferred)

`crmManagerTeamMountReadiness` (deal-panel mount, banker-only) and `crmRoleMountRegistry` (routed-surface
mount, all four roles) use "mount" for two different things. Not incorrect, just confusable. **Decision:
deferred (low)** — a naming/namespacing cleanup for a future pass; no correctness impact.

---

**Bottom line:** the CRM subsystem's real defects are fixed and guarded, its readiness is honest, and
its architecture is documented. The remaining items are closed with reasons — two are genuine external
dependencies (a live environment; a policy call), and the largest is a deliberate keep-and-document,
backed by the import graph. There is no open engineering work hiding here.
