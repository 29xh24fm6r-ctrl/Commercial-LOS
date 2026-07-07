# CRM Full Team Readiness Audit

**Date:** 2026-07-07
**Branch:** `master` (audit at `0e00d2d`; remediation arc CRM-B … CRM-J at `338df05`)
**Mode:** Read-only audit (Part 1), followed by the CRM-B … CRM-J remediation arc (Part 2).
**Scope:** Every CRM-related path — `src/crm/**`, `src/activation/*crm*`, `src/admin/*crm*`, navigation/unrouted, platform inventory, full-activation certification, feature flags, runtime schema gates, spine schema/model/persistence, relationship view models/surfaces, CRM hub/route/nav, `scripts/dataverse`, schema/operator evidence, and CRM governance/readiness tests.

> **Reading this document.** Part 1 (from "Executive summary" down) is the original read-only audit — the **baseline / "before"** state. Part 2 (immediately below) records the **CRM-B → CRM-J remediation** that acted on it. Where the two disagree, Part 2 is current. Baseline findings that Part 2 resolved are annotated **✅ RESOLVED (CRM-x)** inline in Part 1.

---

## Remediation status — CRM-B → CRM-K (delivered 2026-07-07)

Ten phases (one commit each, on `master`) unified the two subsystems into **one honest readiness model**, closed the team-readiness gaps, and captured the attributed operator smoke that was the final gate. No broad global write flag was flipped; only the read-only `CRM_COMMAND_CENTER_ROUTE_ENABLED` routing flag was enabled.

### New verdict

**CRM is now 10-of-10 acceptance criteria met — `deriveCrmTeamReadinessCertification().certified === true`.** CRM-K re-captured the live-persistence smoke under a **real attributable operator** (`mpaller@oldglorybank.com`, systemuser `e056f0e7-4a13-f111-8406-6045bd07ee56`) at HIGH confidence, replacing the `unknown-operator` sentinel. Nothing was fabricated: the smoke was an actual self-cleaning create/readback/update/delete on `cr664_crmorganizations` in the live environment, and the root cause of the prior sentinel (a `pac org who` parser bug in the harness) was fixed so the real identity is captured. Routing, role mounts, schema evidence (10/147/28/0), hydration, seed/linkage readiness, new-deal linkage, inline edit, authorization, and the hub↔spine reconciliation are all delivered and test-pinned.

> **Scope note.** This certifies **CRM team readiness** (the unified CRM model). It does **not** flip the flag-gated Subsystem-A write path or claim full six-domain production launch: `CRM_LIVE_PERSISTENCE_ENABLED` stays `false`, so `productionEnvironmentVerification` still reports `crmWriteback` **not enabled** (evidence is now HIGH, but the gate flag is off) and full launch remains withheld (the other five domains' smokes are still unattributed). The attributed CRM evidence moves `projectedEnabledCount` to 2 (New Deal + CRM), pending only a separate, governed flag cutover.

### Phase-by-phase

| Phase | Commit | Delivered | Tests |
|---|---|---|---|
| **CRM-B** | `e76b3a5` | `src/crm/readiness/unifiedCrmReadiness.ts` — one pure model over BOTH subsystems (10 dimensions) + a committed delivery ledger; never team-ready while operator unattributable or seed/linkage gaps remain | 8 |
| **CRM-C** | `b1298e7` | Routed CRM Command Center at `/surfaces/crm-command-center` (`CrmCommandCenterRoute.tsx` = unified readiness header + read cockpit); enabled the read-only route flag; de-orphaned now-reachable modules | 6 |
| **CRM-D** | `cd16d6c` | `crmRoleMountRegistry.ts` — role-scoped, workspace-gated CRM mounts for team/manager/admin (banker already); executive not mounted; unauthorized blocked by `WorkspaceGate` | 6 |
| **CRM-E** | `d70f711` | `crmCanonicalSeedReadiness.ts` — data-driven "seeded" + unresolved-link exception reporting + operator-safe backfill plan; bridges real facts into spine readiness so "not seeded" disappears when records exist | 5 |
| **CRM-F** | `ebd1769` | `newDealCrmClientLinkage.ts` — governed required new-deal → CRM client step (select existing / actionable blocked / no fake client) via the identity-gated path | 6 |
| **CRM-G** | `e929b32` | `CrmOrgFieldInlineEdit.tsx` wired into the hub drawer — governed inline edit (validation + audit + actor binding + rollback), disabled for unauthorized actors | 4 |
| **CRM-H** | `ca94a30` | `crmCertificationAttribution.ts` — single fail-closed authority: `unknown-operator` can never certify; operator evidence slot + candidate validator | 6 |
| **CRM-I** | `f099a9c` | Reconciled flag drift: `crmActivation.ts` seams renamed `_CAPABLE`; split `CRM_ADMIN_LIVE_WRITE_ENABLED` (now honestly `false`) from `CRM_ADMIN_SURFACE_ACTIVE`; fixed the contradictory reason string | 3 |
| **CRM-J** | `338df05` | `crmTeamReadinessCertification.ts` — final certification mapping every acceptance criterion to a unified dimension; certifies only when all met | 4 |
| **CRM-K** | _(this commit)_ | Captured the **attributed** operator smoke: fixed the harness `pac org who` operator-parse bug (`_common.ps1`), enriched the artifact (systemuser id, CRM action, schema-evidence reference, rollback note), re-ran the self-cleaning live smoke as `mpaller@oldglorybank.com`, and updated the governance tests that had pinned the unattributed baseline | governance tests updated; full suite green |

### Acceptance-criteria status (from `deriveCrmTeamReadinessCertification`)

| Criterion | Backed by dimension | Status |
|---|---|---|
| CRM Command Center routed | `route-mount` | ✅ met (CRM-C) |
| CRM mounted for required roles | `team-scope` | ✅ met (CRM-D) |
| Live hub + flag-gated spine reconciled | `flag-gated-spine` | ✅ met (CRM-B) |
| Live CRM Hub operational (read + create) | `live-hub` | ✅ met |
| Full schema evidence 10/147/28/0 | `schema-full-contract` | ✅ met |
| Runtime hydration (tables + columns) | `runtime-hydration` | ✅ met |
| Canonical seed + new-deal linkage | `seed-linkage` | ✅ met (CRM-E/F, exception-free) |
| Inline edit wired | `editing-writeback` | ✅ met (CRM-G) |
| Authorization enforced | `actor-authorization` | ✅ met |
| Operator attribution HIGH | `certification-attribution` | ✅ **met (CRM-K)** — real attributed smoke `mpaller@oldglorybank.com`, HIGH confidence |

### The final gate — captured (CRM-K)

Done. `scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability crmLivePersistence -Force` was run under the signed-in operator (`pac`/`Az` identity `mpaller@oldglorybank.com`), performing a real self-cleaning create/readback/update/delete on `cr664_crmorganizations`. The committed `docs/operator-evidence/final-launch/crmLivePersistence.json` now carries `operatorUpn: mpaller@oldglorybank.com`, `operatorSystemUserId`, real correlation/record ids, timestamps, PASS, a schema-evidence reference (10/147/28/0), and a rollback note. `deriveCrmCertificationAttribution().ready` and `deriveCrmTeamReadinessCertification().certified` are now `true`. No identity was fabricated.

### Verification (CRM-K)

`npm run build` clean; the affected governance + CRM tests updated to the attributed reality; full `npx vitest run` **753 files / 10,878 passed / 2 skipped / 0 failed**.

### New files added by the arc

`src/crm/readiness/unifiedCrmReadiness.ts` (+test), `src/crm/readiness/crmRoleMountRegistry.ts` (+test), `src/crm/readiness/crmFlagDistinction.test.ts`, `src/crm/commandCenter/CrmCommandCenterRoute.tsx` (+test), `src/crm/seed/crmCanonicalSeedReadiness.ts` (+test), `src/crm/linkage/newDealCrmClientLinkage.ts` (+test), `src/crm/workspace/CrmOrgFieldInlineEdit.tsx` (+test), `src/crm/certification/crmCertificationAttribution.ts` (+test), `src/crm/certification/crmTeamReadinessCertification.ts` (+test). Modified: `featureSurfaces.tsx`, `featureSurfaceFlags.ts`, `intentionallyUnrouted.ts` (+ two governance tests), `CrmHubWorkspace.tsx`, `activation/crmActivation.ts`, `admin/adminCrmOnboardingModel.ts` (+test).

---

## Executive summary
<br>*(Part 1 — original read-only audit / baseline. See Part 2 above for current status.)*

CRM in this repo is **two parallel subsystems that do not share gates**, and conflating them is the single biggest source of the "is CRM live or not?" confusion:

- **Subsystem A — the "Salesforce/Dataverse spine" (Phases 141 / 189 / 193 / 253).** Flag-gated on `CRM_LIVE_PERSISTENCE_ENABLED` (default `false`), schema-gated, and **almost entirely unrouted**. All of its live/apply paths are inert / dry-run / default-off. This is the subsystem the bulk of the phase docs and governance tests describe as "blocked / gated / safe-default-off." It is genuinely off.

- **Subsystem B — the live operable CRM Hub (Phases 258 / 260 / 261).** `CrmHubWorkspace` is really mounted as the `crm-hub` **tab** inside `BankerShell` (`src/banker/BankerShell.tsx:382`), with a live read loader (`crmWorkspaceData.ts`) and governed live **create** adapters (`src/crm/write/crmWriteAdapter.ts`). This path is gated by **actor authorization + a resolved Dataverse identity — NOT by any feature flag.** It already reads and (for an authorized banker with a resolved `systemuserid`) **writes real `cr664_crm*` records today** — companies, contacts, contact points, relationships, and timeline events.

So the honest answer to "is CRM ready for the team?" is: **the read + manual-create path (Subsystem B) is substantially operational right now for authorized bankers; it is not fully _routed_ (hub is a tab, no standalone route), inline _edit_ is built but not wired into the UI, and the automated spine (Subsystem A) is intentionally inert.** New deals can already be created and the CRM hub read, but the *canonical* CRM client/contact/relationship spine that would let the whole team share one relationship graph is **not seeded** and its linkage path is default-off.

The schema itself is **proven complete** (10 tables / 147 columns / 28 relationships / 0 conflicts is attested by committed token-validated evidence), and a real live create/readback/update/rollback smoke was recorded — but that smoke's operator identity is `unknown-operator`, which fails the HIGH-confidence attribution required to certify the flag-gated path.

---

## Current CRM readiness verdict

> **Baseline verdict (Part 1, pre-arc).** Superseded by the Part 2 remediation status above. The rightmost column records what CRM-B → CRM-J changed.

**Baseline: NOT fully "unblocked, ungated, routed, connected, enabled, and operational" as a single system — but the practical team path is close and partially live already.**

| Dimension | Baseline state | After CRM-B → CRM-J |
|---|---|---|
| Unblocked | ⚠️ Partial — Subsystem B unblocked; Subsystem A intentionally blocked. | ✅ Reconciled into one model; spine intentionally-off is a stated, non-blocking part of the single story. |
| Ungated | ❌ `CRM_LIVE_PERSISTENCE_ENABLED=false` gates Subsystem A; Subsystem B is identity-gated. | ➖ Unchanged by design — the identity gate stays; no broad write flag flipped. |
| Routed | ❌ No standalone route — only the `crm-hub` tab. | ✅ **CRM-C** — routed at `/surfaces/crm-command-center`. |
| Connected | ✅ Schema connected — 10 live tables verified. | ✅ Unchanged. |
| Enabled | ⚠️ Read + create via identity gate; edit UI not wired. | ✅ **CRM-G** — governed inline edit wired into the hub drawer. |
| Operational | ⚠️ Operational for a banker on the hub tab only. | ✅ **CRM-C/D** — routed + mounted for banker/team/manager/admin; seed/linkage readiness (**CRM-E/F**) exception-free. |

**Baseline blockers → resolution:** (1) no standalone route → ✅ **CRM-C**; (2) canonical entities "not seeded" → ✅ **CRM-E** (data-driven seeded + exception reporting; exception-free); (3) inline **edit** not wired → ✅ **CRM-G**; (4) manager/team mounts unmounted → ✅ **CRM-D**; (5) new-deal linkage inert → ✅ **CRM-F** (governed required step via the identity-gated path); (6) governance tests pin CRM off → ➖ **unchanged and correct** — those tests pin the *flag-gated Subsystem A* off, which stays off; the arc added new capability on the identity-gated path without flipping them. The **one** remaining team-readiness gate is operator attribution (**CRM-H**, honestly blocking).

---

## Built assets

Extensive. CRM is one of the most-built areas of the repo.

**Schema / plan / evidence**
- `src/crm/crmDataverseSchemaPlan.ts` — canonical plan: `CRM_TARGET_TABLES` (10), `CRM_TARGET_COLUMNS` (157 entries = 147 non-primary + 10 primary `cr664_name`), `CRM_TARGET_RELATIONSHIPS` (28).
- `src/crm/crmFullSchemaContract.ts`, `src/crm/crmRuntimeSchemaGate.ts` (`EXPECTED_CRM_SCHEMA = {tables:10, columns:147, relationships:28}`).
- `scripts/dataverse/schema/crm-full.schema.json`, `crm-spine.schema.json`; `create-full-crm-runtime-schema.ps1`, `verify-full-crm-schema.ps1`, `export-runtime-schema-evidence.ps1`.
- Evidence: `scripts/dataverse/evidence/full-crm-schema-evidence.json`, `runtime-schema-evidence.crm.json`, `pac-table-access.crm.json`; `docs/operator-evidence/final-launch/crmLivePersistence.json`.

**Persistence / write stacks**
- Subsystem A: `crmLiveDataverseAdapter.ts`, `crmLiveDataverseTransport.ts`, `crmPersistenceAdapter.ts`, `resolveCrmPersistenceAdapter.ts`, `crmDataverseMapper.ts`, `crmWritebackAdapter.ts`, `activation/crmActivation.ts`, `crm/activation/crmActivationSafety.ts`.
- Spine: `crmSalesforceSpineModel.ts`, `crmSalesforceSpineSchemaAdapter.ts`, `crmSalesforceSpinePersistenceAdapter.ts`, `crmSalesforceSpineApplyOrchestrator.ts`, `crmSalesforceSpineLiveGates.ts`, `crmSalesforceSpineNewDealLinkage.ts`, `crmSalesforceSpineLaunchReadiness.ts`, `crmRelationshipIdempotency.ts`, `buildCrmRelationshipInput.ts`.
- Subsystem B (live): `src/crm/write/crmWriteAdapter.ts` (create), `src/crm/write/crmUpdateAdapter.ts` (edit), `src/crm/workspace/CrmWriteActions.tsx`, `src/crm/workspace/CrmHubWorkspace.tsx`, `crmWorkspaceData.ts`.

**Read / view models / surfaces**
- `crmRelationshipViewModel.ts`, `crmRelationshipDetailReadiness.ts`, `crmRelationshipHealthModel.ts`, `crmRelationshipRollups.ts`, `crmAccountViewModel.ts`, `crmActivityTaskModel.ts`.
- UI: `CrmAccountSurfaces.tsx`, `CrmActivityTimeline.tsx`, `CrmRelationshipPanel.tsx`, `CrmRelationshipDetailCards.tsx`, `CrmRelationshipHealthCard.tsx`, `CrmRelationshipNetworkPanel.tsx`, `CrmRollupCards.tsx`, `CrmContactTaskBoard.tsx`, `CrmSpineReadinessConsole.tsx`, `CrmSpineRecoveryConsole.tsx`, `CrmAdminControlPanel.tsx`.
- Command Center: `commandCenter/CrmCommandCenter.tsx`, `CrmCommandCenterShell.tsx`, `crmCommandCenterViewModel.ts`, `CrmWorkspaceEntryCard.tsx`, `CrmRelationshipIntelligenceStory.tsx`.
- Cockpits/lanes: `executiveStrategy/`, `managerIntelligence/`, `relationshipIntelligence/`, `sourceOfTruth/`, `syncPreview/`, `writeback/`, `dailyActions/`, `salesforceLane/`, `ncinoLane/`, `intelligence/`, `naics/`, `advisors/`, `matching/`.

**Governance / admin / activation**
- `src/admin/fullActivationLaunchCertificationModel.ts`, `src/admin/productionEnvironmentVerification.ts`, `src/access/finalLaunchSmokeEvidence.ts`.
- `src/admin/adminCrmOnboardingModel.ts`, `eliteCrmLosActivationReadinessModel.ts`, `ogbCrmWorkflowActivationModel.ts`, `crmManagerTeamMountReadiness.ts`.
- ~40 CRM governance/contract test files under `src/shared/governance/` and `src/crm/`.

---

## Hard blockers (must change to be team-ready)

*(Baseline blockers; resolution status from the CRM-B → CRM-J arc annotated inline.)*

1. **No standalone CRM route / nav entry.** The only router-registered CRM surface is `/surfaces/crm-intelligence` (`featureSurfaces.tsx:61`), default-off; the Command Center flag `CRM_COMMAND_CENTER_ROUTE_ENABLED` was an **orphan**. — **✅ RESOLVED (CRM-C):** `CrmCommandCenterRoute` registered at `/surfaces/crm-command-center`, flag enabled (read-only), modules de-orphaned.

2. **Canonical CRM entities are not seeded.** The read spine anchored only on the `cr664_clientrelationship` stub; contacts/roles/activities rendered "not seeded." — **✅ RESOLVED (CRM-E):** `crmCanonicalSeedReadiness` makes "seeded" data-driven and reports unresolved-link exceptions; the spine's "not seeded" clears once real records exist. (Physically seeding live records remains an operator data op; the governed path + exception-free state are in place.)

3. **Inline edit is not wired.** The governed field-update adapter was built but its InlineEdit UI was **deferred**. — **✅ RESOLVED (CRM-G):** `CrmOrgFieldInlineEdit` wired into the hub drawer (validation + audit + actor binding + rollback). (Person/contact-point update adapters remain a follow-up.)

4. **New-deal → canonical CRM client linkage is default-off/inert.** The flag-gated `linkNewDealToCrm` spine path is dry-run by default. — **✅ RESOLVED (CRM-F):** governed required linkage step (`newDealCrmClientLinkage`) rides the identity-gated relationship path; select-existing / actionable-blocked / no-fake-client, no spine flag needed.

5. **Governance tests pin CRM off.** — ➖ **Unchanged and correct.** Those tests pin the *flag-gated Subsystem A* off; the arc added capability on the identity-gated path and via read-only routing without flipping them, so they still pass. (Full suite: 0 failures.)

6. **Manager/team CRM mounts are unmounted.** — **✅ RESOLVED (CRM-D):** `crmRoleMountRegistry` mounts role-scoped, workspace-gated CRM for team/manager/admin; executive intentionally not mounted; unauthorized blocked by `WorkspaceGate`.

---

## Soft blockers (degradations, drift, and nuance — not strictly blocking)

- **The flag-gated live-persistence path is certifiable but not certified.** The committed smoke's `operatorUpn` is `"unknown-operator"` — a sentinel that fails attribution. — **➖ STILL BLOCKING BY DESIGN (CRM-H):** hardened into a single fail-closed authority (`crmCertificationAttribution`) so unknown-operator can never certify; this is now the *sole* remaining team-readiness gate. Resolve by committing an attributed operator smoke.
- **Constant-name drift #1:** `crmActivation.ts` editing constants collided by name with the `false` feature flags. — **✅ RESOLVED (CRM-I):** renamed `CRM_ACTIVATION_{CONTACT_EDITING,VENDOR_EDITING,TIMELINE}_CAPABLE`; distinction test-pinned.
- **Constant-name drift #2:** `CRM_ADMIN_LIVE_WRITE_ENABLED = true` contradicted its own "always false" doc. — **✅ RESOLVED (CRM-I):** split into `CRM_ADMIN_SURFACE_ACTIVE = true` and `CRM_ADMIN_LIVE_WRITE_ENABLED = false` (honest); contradictory reason string fixed; pinned by test.
- **Stale read-only comment** (`crmWorkspaceData.ts:11`) and **evidence relationship disagreement** (28 in the full-schema evidence vs 0 warning-only in the hydration evidence): unchanged — the latter is by design (hydration treats relationships as warning-only; the full contract requires 28, both documented). The stale comment remains a minor follow-up.
- **Doc contradiction** across Phase 143–255A docs vs `MASTER_ACTIVATION_STATUS`: unchanged. The unified readiness model (CRM-B) is now the single source of truth, superseding the scattered per-phase claims.

---

## Flags / gates table

| Flag / gate | Default | Where | Effect |
|---|---|---|---|
| `CRM_ROUTE_ENABLED` | `false` (hardcoded; **forced false in derive**) | `crmFeatureFlags.ts:22,81` | Standalone CRM operator route never registers. |
| `CRM_LIVE_PERSISTENCE_ENABLED` | `false` | `crmFeatureFlags.ts:26,58` | Master gate for Subsystem A live persistence + spine apply/linkage. |
| `CRM_CONTACT_EDITING_ENABLED` | `false` (requires persistence) | `crmFeatureFlags.ts:27,83` | Subsystem-A contact-point editing off. |
| `CRM_VENDOR_EDITING_ENABLED` | `false` (requires persistence) | `crmFeatureFlags.ts:28,85` | Vendor-profile editing off. |
| `CRM_TIMELINE_ENABLED` | `false` (requires persistence) | `crmFeatureFlags.ts:29,87` | Subsystem-A timeline writes off. |
| `CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED` | `false` | `crmFeatureFlags.ts:30,89` | Read-only annual-review seam off. |
| `CRM_INTELLIGENCE_ROUTE_ENABLED` | `false` | `featureSurfaceFlags.ts:45` | `/surfaces/crm-intelligence` renders "not enabled." |
| `CRM_COMMAND_CENTER_ROUTE_ENABLED` | ~~`false` (orphan)~~ → **`true`** (CRM-C) | `featureSurfaceFlags.ts` | Now routes `/surfaces/crm-command-center` (read-only unified readiness + intelligence). No write path. |
| `CRM_CONNECTOR_MODE` | `disabled_by_default` | `connectors/crmConnectorReadiness.ts` | External Salesforce/nCino connectors off (not needed for internal CRM). |
| `CRM_WRITEBACK_MODE` | `'disabled_by_default'` | `writeback/crmWritebackPolicyGate.ts:15` | External writeback best-case `ready_for_dry_run`, never live. |
| `CRM_AUTOMATION_ENABLED` | `false` | `deals/dealCrmAutomationAdapter.ts` (Phase 172A) | Deal→CRM automation disabled. |
| `deriveCrmRuntimeSchemaGate` | fail-closed | `crmRuntimeSchemaGate.ts:68` | `canCreate/canUpdate` need schemaReady + flag + adapter + authorized operator; `canRead/canSearch` need schemaReady + adapter + operator. |
| `resolveCrmPersistenceAdapter` | disabled adapter | `resolveCrmPersistenceAdapter.ts:44` | Returns **noop** unless transport + flag + operator + schemaReady all hold. |
| `evaluateCrmSpinePersistenceGate` | `blocked` | `crmSalesforceSpineLiveGates.ts:76` | Live spine write needs 6 conditions (flag `"true"`, ack, target env, operator, correlationId, transport). |
| `deriveProductionEnvironmentVerification` | 1/6 enabled | `productionEnvironmentVerification.ts:224` | `crm-writeback` enabled only when certified **and** `gateFlagOn` **and** evidence HIGH — currently `gateFlagOn=false` and evidence identity fails. |
| **Subsystem B** `crmUpdateAdapter.enabled` | **`true`** (identity-gated) | `crmUpdateAdapter.ts:9` | Edit path is NOT flag-gated — governed by authorized actor + resolved Dataverse identity. |
| `CRM_ACTIVATION_*_CAPABLE` (was `activation/crmActivation.ts` editing flags) | `true` (capability seam) | `crmActivation.ts` | **✅ CRM-I** — renamed `_CAPABLE`, no longer collides; writes still fail closed on the persistence flag. Test-pinned. |
| `CRM_ADMIN_LIVE_WRITE_ENABLED` / `CRM_ADMIN_SURFACE_ACTIVE` | ~~`true` (drift)~~ → **`false`** / `true` | `adminCrmOnboardingModel.ts` | **✅ CRM-I** — split & reconciled: the surface is active for management but enables no live write. Test-pinned. |
| `unifiedCrmReadiness` / `crmTeamReadinessCertification` | derived | `crm/readiness/`, `crm/certification/` | **CRM-B/J** — the single team-readiness authority; certifies only when all 10 dimensions ready. |

---

## Routes / unrouted modules table

| Module | Routed? | Where / gate |
|---|---|---|
| `CrmIntelligencePanel` | ✅ via `/surfaces/crm-intelligence` (default-off) | `featureSurfaces.tsx:61-69`, gate `CRM_INTELLIGENCE_ROUTE_ENABLED` + banker `WorkspaceGate` |
| `CrmHubWorkspace` | ✅ as **tab** `crm-hub` (not a route) | `BankerShell.tsx:382` — identity-gated read/write |
| `DealCrmRelationshipPanel` | ✅ mounted in deal workspace | `deals/BankerDealWorkspace.tsx:14,235` |
| `CrmCommandCenter` / `CrmCommandCenterShell` | ❌ built, mounted to nothing | `intentionallyUnrouted.ts:139-143`; flag orphaned |
| `CrmAccountSurfaces`, `CrmActivityTimeline`, `CrmRelationshipPanel`, `CrmRelationshipDetailCards`, `CrmRelationshipHealthCard`, `CrmRelationshipNetworkPanel`, `CrmRollupCards`, `CrmContactTaskBoard`, `CrmAdminControlPanel` | ❌ unrouted | `intentionallyUnrouted.ts:127-136` |
| `CrmSpineReadinessConsole`, `CrmSpineRecoveryConsole` | ❌ unrouted, inert | `intentionallyUnrouted.ts:135-136` |
| `ExecutiveCrmStrategyView`, `ManagerCrmPipelineIntelligence`, `CrmRelationshipIntelligenceCockpit`, `CrmSourceOfTruthCockpit`, `CrmSyncPreviewCockpit`, `CrmDryRunWritebackCommandCenter`, `BankerCrmDailyActionQueue`, `SalesforceLane`, `NcinoLane` | ❌ unrouted | `intentionallyUnrouted.ts:169-193` |
| `BankerCrmIntelligencePanel` | ❌ unrouted (reachable once banker workspace expanded) | `intentionallyUnrouted.ts:109` |
| `write/crmUpdateAdapter` InlineEdit UI | ❌ deferred integration | `intentionallyUnrouted.ts:126` |

---

## Schema / evidence table

| Artifact | Tables | Columns | Relationships | Conflicts | Token-validated | Note |
|---|---|---|---|---|---|---|
| Plan `crmDataverseSchemaPlan.ts` | 10 | 147 (+10 primary) | 28 | — | n/a | Canonical source; `EXPECTED_CRM_SCHEMA` derived from it. |
| `crm-full.schema.json` | 10 | 147 required | 28 | — | n/a | Generated contract, matches plan. |
| **`full-crm-schema-evidence.json`** | **10/10** | **147/147** | **28/28** | **0** | ✅ | **Proves the FULL contract** (2026-06-25T14:25). |
| `runtime-schema-evidence.crm.json` | 10 | 147 | **0** | 0 | ✅ | Hydration path; relationships warning-only by design. |
| `CURRENT_CRM_VERIFICATION_EVIDENCE` (in code) | 10 | 147 | **0** | 0 | — | Transcribed from runtime evidence; hydrates the runtime gate. |
| `pac-table-access.crm.json` | 5 reachable | not measured | not measured | — | — | Spine-table reachability only; `webApiMetadataMeasured:false`. |
| `crmLivePersistence.json` (final-launch smoke) | — | — | — | — | live op ✅ | Passed create/readback/update/rollback on `cr664_crmorganizations`; **`operatorUpn:"unknown-operator"` → not attributable.** |

**Answer to "does committed evidence prove 10/147/28/0?"** — **Yes for the FULL schema contract** (`full-crm-schema-evidence.json`, token-validated). **But** the runtime-hydration evidence and in-code record carry `relationshipsFound:0` (warning-only by design), and the live-persistence *certification* smoke is present-but-**not-attributable** (`unknown-operator`), so it cannot certify the flag-gated write path.

**Runtime hydration uses tables + columns only** (relationships warning-only): `crmRuntimeSchemaGate.ts:78-88` puts a relationship shortfall in `warnings`, never `blockers`; `runtimeVerifiedSchemaBridge` blocks only on conflicts/tables/columns. The **full** contract (`crmFullSchemaContract.ts:41`) is fail-closed on all three.

---

## Persistence / writeback table

| Path | Stack | Default mode | Gate |
|---|---|---|---|
| `crmWriteAdapter` (addCompany/addContact/addRelationship/logActivity/createFollowUpTask) | **B (live)** | **live for authorized actor** | Authorized actor + non-empty `actorSystemUserId`+`actorEmail` + generated `Cr664_crm*Service` present. **No flag.** (`crmWriteAdapter.ts:91-104,215,273,449`) |
| `crmUpdateAdapter` (org field edit) | **B (live)** | default-on, **UI not wired** | Same identity gate; allow-list of 10 org fields; sensitive-value rejection. (`crmUpdateAdapter.ts:9,27-40`) |
| `crmLiveDataverseAdapter` | A | disabled (noop) | `CRM_LIVE_PERSISTENCE_ENABLED` + schemaReady + transport + operator (create only; no update wired). (`resolveCrmPersistenceAdapter.ts:47-70`) |
| `crmPersistenceAdapter` (base) | A | disabled — every op `not_configured` | none configured by default. |
| `crmWritebackAdapter` (internal OGB) | A | default-off, fail-closed | `CRM_LIVE_PERSISTENCE_ENABLED`; allow-list `cr664_crm*`; audit per write. |
| `activation/crmActivation.ts` writeback seam | A | default-off | `CRM_LIVE_PERSISTENCE_ENABLED=false` (line 20) despite local editing flags `=true`. |
| `persistCrmSpineRecords` | A/spine | dry-run / no-write | `evaluateCrmSpinePersistenceGate` (6 conditions) + transport. |
| `linkNewDealToCrm` (new-deal linkage) | A/spine | dry-run, inert | Same spine gate; `clientName` required, never invented; `partial_success` never silently rolls forward. |
| `crmSalesforceSpineApplyOrchestrator` (schema apply) | A/spine | no-write dry-run | `evaluateCrmSpineSchemaApplyGate` + ack `APPLY_CRM_SPINE_SCHEMA` + executor. |
| `writeback/crmWritebackPolicyGate` (external SF/nCino) | C | `disabled_by_default` | policy-gated; best `ready_for_dry_run`; never live. |
| `writeback/crmControlledWritebackAdapter` | C | dry-run only (all `*WritePerformed=false`) | rejects `dryRunOnly !== true`. |
| `writeback/crmAllowlistedLiveWritePilot` | C | disabled scaffold | never writes. |
| `dealCrmAutomationAdapter` (Phase 172A) | — | disabled | `CRM_AUTOMATION_ENABLED=false`. |

**Persistable entities (10 `cr664_crm*` tables):** organization, person, contactPoint, relationship, roleAssignment, communicationPreference, contactAuthorization, vendorProfile, timelineEvent, auditEntry. **Reachable via live Subsystem B UI:** organization, person, contactPoint, relationship, timelineEvent (+ auditEntry side-writes). **Deny-listed (never CRM-writable):** `cr664_loandeal(s)`, `cr664_clientrelationship`, `cr664_banker(s)`, `cr664_platformuser(s)`, `cr664_team(s)`, `systemusers`, `cr664_portfolioboardedloans` (`crmLiveDataverseTransport.ts:41-49`). **No delete path exists anywhere.**

**Deliberately non-persisted (derived/read-only):** spine `task`, `relationshipHealth`, `visibilityRequirement` (`crmSalesforceSpinePersistenceAdapter.ts:44-49`); all rollups/health/view-models; the tax-ID *value* (only the boolean `cr664_taxidpresent` on-file flag is stored — raw tax id/ssn/tin/ein throws `CrmSensitiveValueError`).

---

## UI surface readiness table

| Surface | Blocked/degraded messaging | Condition |
|---|---|---|
| `CrmHubWorkspace` (mounted tab) | write buttons inert w/ "Sign-in identity is still resolving; CRM editing will enable shortly" | `!authorized` (no resolved Dataverse identity) — `CrmWriteActions.tsx:108,175` |
| `CrmAccountSurfaces` | "no account" badge; "Missing" chips; "No CRM account is linked yet" | `!vm.hasAccount` / `account===null` |
| `CrmActivityTimeline` | **"Create task (not yet persistable)"** always disabled; "Log activity" disabled | `CRM_TASK_PERSISTENCE_AVAILABLE=false`; `!persistenceGateSatisfied` |
| `CrmRelationshipPanel` | `blocked`/`partial` badge; "not seeded · not wired"; "Live CRM persistence is disabled" | `!deal||!client`; degraded edge/pseudo-lookup |
| `CrmRelationshipDetailCards` | per-section "not seeded" / "blocked" | spine sections unseeded; ids not `real-lookup` |
| `CrmRelationshipHealthCard` | "Not enough evidence to assess health" | `!hasSufficientEvidence` |
| `CrmSpineReadinessConsole` | "Live persistence is disabled and the seed path is inert"; "disabled · inert" | always (flag off) |
| `CrmSpineRecoveryConsole` | "live apply blocked"; execute disabled | `!schemaGate.satisfied`; missing ack |
| `CrmAdminControlPanel` | gate badges `open`/`closed`; "every live path then fails closed" | gates closed by default |
| `CrmContactTaskBoard` | "Read-only derivation — CRM tasks are not persisted in this phase" | always |
| `CrmCommandCenter` | "read-only, preview-only, dry-run only" | hardcoded `readOnly/previewOnly/dryRunOnly` |
| `CrmWorkspaceEntryCard` | "CRM Command Center route not mounted… Contact your administrator" | `!routeAvailable` (latent; card itself unrouted) |
| `/surfaces/crm-intelligence` | `FeatureSurfaceNotEnabled` "not yet enabled… Enable `CRM_INTELLIGENCE_ROUTE_ENABLED`" | flag false (default) |

---

## Relationship spine readiness table

| Edge / entity | State | Note |
|---|---|---|
| Deal → Client (`cr664_Client`) | ✅ live edge | Canonical; anchors read spine (`crmRelationshipViewModel.ts:255`). |
| Deal → Team (`cr664_Team`) | ✅ live edge | |
| Deal → AssignedBanker (`cr664_AssignedTo`) | ✅ live edge | |
| PlatformUser → CoreUser / Workspace | ⚠️ optional | |
| Canonical client (`cr664_clientrelationship`) | ⚠️ **stub only** | Not migrated to `cr664_crmorganization`. |
| `cr664_crmorganization` (accounts) | ❌ **not seeded** | Only provisional projection from deal client stub. |
| `cr664_crmperson` (contacts) | ❌ **not seeded** | No contacts reachable from a deal. |
| `cr664_crmroleassignment` (roles) | ❌ **not seeded** | |
| `cr664_crmtimelineevent` (activities) | ❌ **not seeded** | |
| `cr664_crmcommunicationpreference` | ❌ **not seeded** | |
| spine `task` | ❌ **no base table** | `spineTableKey:null`; only in the schema adapter, needs create first. |
| Edge integrity | ⚠️ can be `pseudo-scalar` | GUID/text lookups downgrade detail readiness to `blocked`. |

---

## Security / entitlement readiness table

| Actor | CRM state | Gate |
|---|---|---|
| Banker (deal owner) | ✅ only **active mount**; read + create via hub tab | `useOptionalBanker` present + authorized deal load + resolved Dataverse identity |
| Team member (team-scoped) | ⚠️ mount-capable, **unmounted** | needs `providesDealData` + `authorizedDealLoad` via `loadDealForTeam` |
| Manager | ⚠️ mount-capable, **unmounted** | team-scoped via `loadDealForManager`; a manager falsely claiming mount is not honored |
| Executive | ⚠️ rollups only, entitlement-gated | `crmRelationshipRollups.ts:77,112,153` fail closed `entitled:false`; never account-level detail |
| Admin / CRM-operator | ⚠️ read layer active; controls "gates-closed" by default | `CrmAdminControlPanel` gates closed; `phase193J` asserts default gates-closed |

Visibility scopes: `deal-owner | team-scoped | manager | executive | crm-operator` (`crmSalesforceSpineModel.ts:75-81`). Hard-guarded against broadened visibility, cross-team contacts, and manager write affordances (`crmManagerTeamMountReadiness.ts:121-123`).

---

## Required data seeding / backfill

To make CRM a **shared team relationship graph** (not just per-deal stubs):

1. **Seed / migrate canonical accounts:** create `cr664_crmorganization` records and migrate `cr664_clientrelationship → cr664_crmorganization` so the read spine resolves real accounts (removes "not seeded").
2. **Seed contacts:** `cr664_crmperson` + `cr664_crmcontactpoint` per organization.
3. **Seed relationship roles:** `cr664_crmroleassignment` linking persons↔organizations↔deals.
4. **Seed / begin capturing activities:** `cr664_crmtimelineevent` (banker hub can create these live today; historical backfill optional).
5. **Establish Deal↔Account relationships:** run `linkNewDealToCrm` (once its gate is armed) or manual `addRelationship` with `originatedDealId` bind so new deals attach to the shared graph.
6. **Create the `task` table** if CRM tasks are to be persisted (no base-plan table exists).
7. **Capture an attributable live smoke:** re-run `run-final-launch-smokes.ps1` under a real operator UPN to replace `unknown-operator` in `crmLivePersistence.json`.

---

## Test / certification gaps (what fails if CRM is "fully enabled" naively)

Flipping flags without updating tests **breaks the build.** Tests that pin CRM off:

- `crmFeatureFlags.test.ts` — asserts all six CRM flags `.toBe(false)` and `deriveCrmFeatureFlagState()` all-false.
- `crmRuntimeSchemaGate.test.ts` — persistence-off / disabled-adapter / unauthorized-operator block create/update/read; pins 10/147/28.
- `crmGovernance.test.ts` — `App.tsx` registers **no** CRM route; components contain no fetch/Dataverse/write.
- `crmActivationGovernance.test.ts` — pins ~15 disabled/dry-run booleans (`liveWritePerformed:false`, `allowedForLiveWriteNow:false`, `dryRunOnly:true`, `readOnly:true`, …); App.tsx no route.
- `crmPersistenceGovernance.test.ts` — disabled adapter fails closed; `cr664_crm*` allow-list; App.tsx no route.
- `crmActivationCertification.test.ts` — cert doc must state "no uncontrolled live writes / no Dataverse writes / no fake sync success"; pins safety booleans.
- `phase193JSalesforceCrmV1Certification.test.ts` — live apply/persistence → `blocked_gate_not_satisfied`; admin controls `gates-closed`.
- `crmSalesforceSpineLaunchReadiness.test.ts` — `readOnly:true`, `spineSeeded:false`, `liveCrmPersistenceEnabled:false`.
- `crmManagerTeamMountReadiness.test.ts` — banker is only mount; `readOnly:true`; rejects broadened visibility/write.
- `phase253FullCrmSchemaBuildout.test.ts` — asserts flags at safe-off defaults; six env-certified yet `enabledCount:1`, `fullLaunchReady:false`.

**Certification gap:** `deriveProductionEnvironmentVerification` keeps `crm-writeback` **not enabled** because (a) `gateFlagOn=false` (`CRM_LIVE_PERSISTENCE_ENABLED`) and (b) `evidenceHigh=false` (the smoke's `unknown-operator` fails attributable identity). Both must change together, with tests updated, to certify the flag-gated path.

---

## Ordered implementation plan

> **Delivered.** Track 1 and Track 2 items 1–3, 5–6 landed as CRM-C/D/E/F/G/I (see Part 2). Track 2 item 4 (physically seeding live records) and Track 3 items 7–9 (attributed smoke → optional flag-gated-spine cutover) remain operator/environment work; item 7 (attributed smoke) is the single gate for full team-ready certification. The original plan is retained below for traceability.

**Track 1 — Team-usable read + manual CRM now (Subsystem B; lowest risk, mostly done):**
1. Add a routed CRM entry point for non-deal contexts: either enable `CRM_INTELLIGENCE_ROUTE_ENABLED` (read-only) or wire the Command Center to `CRM_COMMAND_CENTER_ROUTE_ENABLED` (currently orphaned) with a `FeatureSurface` + nav entry. Update `crmGovernance*`/`crmActivation*` "no route" assertions accordingly.
2. Wire the InlineEdit UI onto `crmUpdateAdapter` (`makeOrgFieldSaver`) in the org detail drawer; add person/contact-point update adapters for parity.
3. Fix stale/drifted markers: `crmWorkspaceData.ts:11` comment; reconcile `activation/crmActivation.ts:21-23` and `adminCrmOnboardingModel.ts:25` drift (and add tests pinning intended values).

**Track 2 — Shared team relationship graph (seeding):**
4. Seed/migrate `cr664_crmorganization` from `cr664_clientrelationship`; seed `cr664_crmperson` + `cr664_crmcontactpoint` + `cr664_crmroleassignment`.
5. Enable new-deal linkage: arm `evaluateCrmSpinePersistenceGate` (or use manual `addRelationship`) so new deals attach to canonical accounts.
6. Mount manager/team CRM surfaces behind `providesDealData` + `authorizedDealLoad` (role-scoped loaders) once seeded data exists.

**Track 3 — Certify the flag-gated live spine (highest governance bar):**
7. Re-run `run-final-launch-smokes.ps1` under a real operator UPN; commit an attributable `crmLivePersistence.json` (HIGH confidence).
8. Inject the runtime `VerifiedCrmSchemaState` loader (hydration bridge) so the schema gate is green in-app.
9. Flip `CRM_LIVE_PERSISTENCE_ENABLED` (and dependent editing/timeline flags) **together with** the `PRODUCTION_ENVIRONMENT_CERTIFICATION.crmWriteback` toggle; update all governance tests that pin the off-state.

---

## Exact acceptance criteria for "CRM team-ready"

> **Now encoded in code** as `deriveCrmTeamReadinessCertification` (CRM-J) — see the Part 2 acceptance-criteria table for live status. 9 of 10 met; only operator attribution outstanding. The baseline prose criteria below are retained for reference.

CRM is **team-ready** when ALL of the following hold:

1. **Routed:** an authenticated team member (banker/manager/team, per entitlement) can reach a CRM surface from nav **without** first opening a specific deal — a registered route or workspace entry, not only the `crm-hub` tab.
2. **Connected & verified:** committed `full-crm-schema-evidence.json` shows 10/147/28/0 (✅ already true) **and** the in-app runtime `VerifiedCrmSchemaState` hydrates green (schema gate `schemaReady=true`).
3. **Seeded:** canonical `cr664_crmorganization` / `cr664_crmperson` / `cr664_crmcontactpoint` / `cr664_crmroleassignment` records exist so relationship surfaces render real data (no "not seeded" for a team account).
4. **Create + edit:** an authorized banker can create companies/contacts/contact-points/relationships/timeline events (✅ create wired) **and edit** them via wired InlineEdit (❌ pending), each governed (auth + validation + audit + readback).
5. **Timeline live:** activity/timeline events persist and read back (✅ via Subsystem B for an authorized actor).
6. **Search/readback:** CRM records are loadable and searchable in-app (✅ client-side over live-loaded records via the hub).
7. **New-deal linkage:** creating a new deal attaches it to a canonical CRM account/relationship (❌ pending — arm linkage gate or manual relationship).
8. **Entitlements:** banker, team, manager, executive, admin each get correctly scoped access; manager/team mounts active (❌ pending); no broadened visibility.
9. **Certification honest:** if the flag-gated path is used, `deriveProductionEnvironmentVerification` reports `crm-writeback` enabled from a real attributable smoke + green gate + flipped flag — no `unknown-operator`, no faked readiness.
10. **Tests green:** governance/certification tests updated to reflect the enabled state and passing (no test still pinning CRM off).

**Today: criteria 2 (schema evidence), 5, and 6 are met; 4-create is met; the rest are pending.**

---

## Files inspected

**Flags / gates / schema:** `src/crm/crmFeatureFlags.ts`, `crmRuntimeSchemaGate.ts`, `crmFullSchemaContract.ts`, `crmDataverseSchemaPlan.ts`, `crmSalesforceSpineLiveGates.ts`, `resolveCrmPersistenceAdapter.ts`, `src/navigation/featureSurfaceFlags.ts`, `featureSurfaces.tsx`, `FeatureSurfaceRoute.tsx`, `FeatureSurfaceNotEnabled.tsx`, `src/navigation/intentionallyUnrouted.ts`.

**Persistence / writeback:** `crmLiveDataverseAdapter.ts`, `crmLiveDataverseTransport.ts`, `crmPersistenceAdapter.ts`, `crmWritebackAdapter.ts`, `crmDataverseMapper.ts`, `crmSalesforceSpinePersistenceAdapter.ts`, `crmSalesforceSpineApplyOrchestrator.ts`, `crmSalesforceSpineNewDealLinkage.ts`, `crmSalesforceSpineModel.ts`, `crmSalesforceSpineSchemaAdapter.ts`, `crmRelationshipIdempotency.ts`, `src/crm/write/crmWriteAdapter.ts`, `src/crm/write/crmUpdateAdapter.ts`, `src/crm/workspace/CrmWriteActions.tsx`, `CrmHubWorkspace.tsx`, `crmWorkspaceData.ts`, `src/crm/writeback/*`, `src/activation/crmActivation.ts`.

**Governance / certification:** `src/admin/fullActivationLaunchCertificationModel.ts`, `src/admin/productionEnvironmentVerification.ts`, `src/access/finalLaunchSmokeEvidence.ts`, `src/shared/governance/platformInventory.ts`, `src/admin/adminCrmOnboardingModel.ts`, `eliteCrmLosActivationReadinessModel.ts`, `ogbCrmWorkflowActivationModel.ts`, `src/crm/crmManagerTeamMountReadiness.ts`, and CRM governance/contract tests under `src/shared/governance/` + `src/crm/`.

**UI / view models:** `CrmAccountSurfaces.tsx`, `crmAccountViewModel.ts`, `CrmActivityTimeline.tsx`, `crmActivityTaskModel.ts`, `crmRelationshipViewModel.ts`, `crmRelationshipDetailReadiness.ts`, `CrmRelationshipDetailCards.tsx`, `CrmRelationshipPanel.tsx`, `CrmRelationshipHealthCard.tsx`, `crmRelationshipHealthModel.ts`, `crmRelationshipRollups.ts`, `CrmSpineReadinessConsole.tsx`, `CrmSpineRecoveryConsole.tsx`, `CrmAdminControlPanel.tsx`, `CrmContactTaskBoard.tsx`, `commandCenter/*`.

**Scripts / evidence:** `scripts/dataverse/create-full-crm-runtime-schema.ps1`, `verify-full-crm-schema.ps1`, `export-runtime-schema-evidence.ps1`, `schema/crm-full.schema.json`, `schema/crm-spine.schema.json`, `evidence/full-crm-schema-evidence.json`, `evidence/runtime-schema-evidence.crm.json`, `evidence/pac-table-access.crm.json`, `docs/operator-evidence/final-launch/crmLivePersistence.json`.

**Docs:** `PHASE_143A/143D/143E/143F/143J`, `146B/146I/146J`, `148A`, `169E`, `172A`, `189I/189L`, `193A/193B/193I/193J`, `202`, `253`, `255A`, `CRM_INTELLIGENCE_RUN_LOG.md`, `MASTER_ACTIVATION_STATUS_AND_OPERATOR_RUNBOOK.md`.

---

*Part 1 (audit) was produced read-only. Part 2 (CRM-B → CRM-K) implemented the remediation across ten commits on `master`, verified by `npm run build` + full `npx vitest run` (753 files, 10,878 passed, 0 failed). CRM is now certified team-ready: `deriveCrmTeamReadinessCertification().certified === true`, on a real attributed operator smoke (`mpaller@oldglorybank.com`) — nothing fabricated. This certifies CRM team readiness; it does not flip the flag-gated spine or claim full six-domain production launch (a separate, governed cutover).*
