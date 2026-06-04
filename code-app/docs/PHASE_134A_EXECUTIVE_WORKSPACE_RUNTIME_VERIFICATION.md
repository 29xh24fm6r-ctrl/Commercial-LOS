# Phase 134A — Executive Workspace runtime verification & empty-state hardening

## Goal

Confirm the Executive Workspace behaves correctly when reachable, and
stays honest when no executive-scoped data is available. **Test +
documentation only** — no Dataverse writes, no token work, no
entitlement widening, no new access model, no fake fallback data, no
schema changes. No app/runtime source files were modified this phase.

## What the tests pin (the runtime contract)

| Requirement | Where pinned |
|---|---|
| Executive route renders **only** when the primary-workspace **name** resolves to "Executive Dashboard" | `WorkspaceGate.test.tsx` §134A (`resolveWorkspaceRoute('Executive Dashboard')` → executive → gate admits) + `workspaceEntitlements.test.tsx` §134A (name → link chain) + `workspaceRoutes.test.ts` (alias) |
| Non-executive users do **not** get Executive route access | `WorkspaceGate.test.tsx` §134A (non-executive name bounced) + §133B (manager-entitled non-executive bounced; direct URL fails closed) |
| Empty executive pipeline → honest empty state | `ExecutiveCommandCenter.test.tsx` §134A ("fully-empty … empty state and NO KPI ribbon") + §133A |
| Missing/partial data does **not** invent KPIs | `ExecutiveCommandCenter.test.tsx` §134A (empty pipeline → honest `$0` exposure, never inferred from readiness; failed performance slot does not fail-closed or fabricate) |
| Executive surface has **no** write buttons/forms | `ExecutiveCommandCenter.test.tsx` §133A (cockpit) + `ExecutiveWorkspace.test.tsx` §134A (shell: no `<button>`/`<form>`/`onClick`/`onSubmit`, no modal/governed-write/email-send import) |
| Executive surface does **not** reuse manager/team entitlement as a proxy | `workspaceEntitlements.test.tsx` §133B (`useEntitledRoutes` never emits executive) + §134A (non-executive name yields no executive link even with manager+team entitlement) + W2 isolation pins on cockpit + shell |

### Empty / partial-data honesty (the hardening focus)

The cockpit derives from three core executive slots (readiness +
pipeline-by-stage + closing-forecast). The tests pin:

- **Fully empty** (no stage rows AND no readiness rows) → the honest
  empty state renders and **no KPI ribbon / risk strip** is shown —
  nothing is fabricated to fill the page.
- **Empty pipeline, readiness present** → the cockpit renders with
  **`0` active deals and `$0` total exposure**. Readiness rows carry no
  dollar amount, so exposure is never inferred from them.
- **Failed performance slot** (a non-core slot) → the cockpit still
  renders and does **not** fail closed or invent KPIs; only the three
  core slots gate rendering.

## Live verification — once a real Executive primary workspace exists

Provision a pilot user's primary workspace to "Executive Dashboard"
using the guarded seed (Phase 133C), then verify in the deployed app:

1. **Provision (dry-run first, then commit):**
   ```sh
   node scripts/phase122-lookup-repair.mjs \
     --seed-executive-primary-workspace \
     --upn "<pilot UPN>" --workspace-name "Executive Dashboard"
   # then re-run with --commit-seed-executive-primary-workspace
   ```
2. **Reachability:** sign in as that user → land on
   `/workspaces/executive`; the Executive item appears in the workspace
   switcher (and only the workspaces they are otherwise entitled to).
3. **Non-executive negative check:** sign in as a banker/manager/team/
   portfolio user → confirm **no** Executive item in the switcher, and a
   direct `/workspaces/executive` URL bounces to their primary route.
4. **Populated state:** with readiness snapshots + stage/closing-forecast
   data present, confirm the KPI ribbon, strategic risk strip, exposure,
   operations health, data-quality, and top-deals/bottlenecks render with
   real values and deal-drill links.
5. **Empty state:** with no executive snapshot data, confirm the honest
   "No authorized executive snapshot records found" empty state — no
   fabricated KPIs.
6. **Partial state:** with only some slots populated (e.g. readiness but
   no stage aggregates), confirm exposure reads `$0` rather than an
   invented number, and the risk strip reflects the readiness that does
   exist.
7. **Read-only:** confirm there are no write controls (no create/edit/
   send) anywhere on the executive surface, and the Copilot panel shows
   **Not configured**.
8. **Honest omissions:** confirm the disclaimer copy is present —
   "Executive view is derived from authorized lending records currently
   available to this workspace" and "No approval probabilities or
   predictive rankings are shown."

## Rollback (if needed)

Re-point the pilot user's primary workspace back to a prior workspace
name with the same guarded seed (e.g. `--workspace-name "Banker Workspace"`
or `"Manager Command Center"`) — see Phase 133C.

## Acceptance

```
npm test -- Executive ExecutiveWorkspace WorkspaceGate workspaceEntitlements
npm run build
```

Target suites pass (79 tests across the five files, +9 new Phase 134A
pins). Build clean. No source/runtime files changed — tests + this doc
only.
