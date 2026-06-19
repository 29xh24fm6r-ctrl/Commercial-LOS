# Phase 197 — Full System Launch Readiness

## 1. Purpose

This phase adds a **full-system production launch readiness layer** for OGB LOS
V1 — a model, a read-only admin console, documentation, and governance tests that
give admins/operators **one honest view** of whether the entire system is ready
for real V1 use and what remains gated.

This is **not** another pilot-only runbook. It is the full-system launch
readiness surface. It reports posture; it enables nothing.

## 2. Current integrated master posture

- Phase 193A–J CRM V1 foundation / certification merged.
- Phase 194–200 workflow factory foundation merged.
- Phase 194 controlled live New Deal create enablement certification merged.
- Phase 195 V1 controlled production pilot cutover merged.
- Phase 196 V1 pilot enablement evidence certification merged.
- Phase 196 + release-snapshot tests passed.
- Production build passed (from a no-`.power` state via the Phase 190A preflight).

## 3. Full system launch domains

`deriveFullSystemLaunchReadiness()` (`src/admin/fullSystemLaunchReadinessModel.ts`)
derives ten domains from existing constants + static governance state — no SDK
call, no Dataverse read/write, no fetch:

| Domain | Status |
|---|---|
| Banker Workspace | 🟢 ready |
| New Deal Create | 🟡 conditional |
| CRM / Salesforce / nCino Readiness | 🟡 conditional |
| Workflow Factory | 🟡 conditional |
| Credit / Committee / Compliance | 🟡 conditional |
| Data Quality / No Fake Data | 🟡 conditional |
| Permissions / Entitlements | 🟢 ready |
| Operator / Admin Readiness | 🟡 conditional |
| Build / Release | 🟢 ready |
| Final V1.0 Launch Decision | 🟡 conditional |

The read-only `FullSystemLaunchReadinessConsole` renders this model. It is **not
route-mounted** — to avoid any entitlement or route widening, the component and
model are tested and documented but not exposed through a new route.

## 4. Current recommendation: CONDITIONAL GO

`deriveFullSystemLaunchReadiness().recommendation === 'CONDITIONAL_GO'`.

The foundation is built, mounted, governed, and tested, but real production use
still requires operator enablement and signoff for controlled New Deal create.
CRM writeback, workflow writes, borrower communications, and checklist generation
remain intentionally gated / fail-closed unless separately enabled.

## 5. What is ready for use

- **Banker Workspace** — built, governed, and permission controlled; fail-closed
  identity + entitlement gate, no fallback dashboard, no fake/sample data.
- **Permissions / Entitlements** — permission-before-render is required;
  unauthorized users fail closed; no route/entitlement widening.
- **Build / Release** — the Phase 190A build preflight remains wired, so a fresh
  clone builds deterministically from a no-`.power` state; the release-candidate
  snapshot includes the current launch docs and governance tests.

## 6. What remains gated / fail-closed

- **New Deal Create** — a controlled live create path exists and is certified
  (Phase 194/195), but the three global create gates remain **false**
  (`BANKER_NEW_DEAL_CREATE_ENABLED`, `NEW_DEAL_CREATE_ADAPTER_ENABLED`,
  `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`), and `evaluateBankerCreateRollout()`
  returns `disabled` by default. Operator enablement and signoff are required.
  No actorless create.
- **CRM / Salesforce / nCino** — the Salesforce/nCino-style CRM foundation is
  **built, mounted, and certified**, with read-only relationship and
  live-readiness surfaces available; **CRM writeback remains gated / fail-closed**
  unless separately enabled.
- **Workflow Factory** — the factory and workflow surfaces are **mounted**;
  workflow generation / stage / task / write actions remain **fail-closed** unless
  approved dependencies and gates are enabled; there is no borrower send path.
- **Credit / Committee / Compliance** — Phase 192 readiness exists; no fake
  approval and no fabricated source facts.
- **Data Quality / No Fake Data** — no sample/fake/demo data is allowed for
  production readiness; missing data must be shown honestly.

## 7. Required operator actions to move from CONDITIONAL GO to GO

These are the **required operator actions** to move from CONDITIONAL GO to GO:

1. Enable the certified controlled New Deal create pilot switch for the approved
   pilot context (without flipping the three global create constants).
2. Execute the Phase 195 controlled cutover and capture the Phase 196 evidence
   package **outside the repository** (redacted in repo).
3. Confirm audit actor binds `/cr664_users(<CoreUser>)` (never `/systemusers`),
   no borrower comms, no checklist generation, no CRM writeback.
4. Confirm rollback is retained ready (one-line pilot-switch rollback).
5. Release operator signs off with **no stop condition** triggered.

Separately, and only via their own approved enablement phases: CRM writeback,
workflow writes, borrower communications, and checklist generation.

## 8. Explicit Salesforce / nCino-style CRM readiness statement

The Salesforce / nCino-style CRM relationship foundation is **built, mounted, and
certified**. Read-only relationship and live-readiness surfaces are available.
**CRM writeback remains gated / fail-closed** unless separately enabled. This
readiness layer performs no CRM write.

## 9. Explicit New Deal create statement

A **controlled live New Deal create path exists** and is certified. The three
**global create gates remain false**, and **operator enablement is required**
(certified pilot switch + signoff) before live create. No actorless create.

## 10. Explicit workflow statement

The **workflow factory and surfaces are mounted**.
**Workflow writes / generation remain gated** / fail-closed unless approved
dependencies and gates are enabled. No borrower send path exists in the workflow
surfaces.

## 11. Explicit safety statement

This phase makes **no schema change**, **no migration**, **no live gate flip**
(it flips no gate), and **no uncontrolled writes**. Readiness is derived only from
existing constants, existing docs, existing models, and static governance state —
no new SDK call and no direct fetch to live services.

## 12. Explicit no-borrower-comms / no-checklist-generation / no-CRM-writeback statement

This phase introduces **no borrower comms**, **no checklist generation**, and
**no CRM writeback**. The console renders these as standing posture lines and
exposes no create / write / apply / enable / send control.

## 13. Verification commands

```bash
npm --prefix code-app test -- FullSystemLaunchReadiness phase197FullSystemLaunchReadiness releaseCandidateSnapshot
git -C code-app diff --stat
git -C code-app diff --check
git -C code-app status --short
npm --prefix code-app run build
```
