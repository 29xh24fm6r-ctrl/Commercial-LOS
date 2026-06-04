# Phase 135A — Executive demo readiness + release snapshot

## Purpose

Prepare the Executive Workspace for demo/review **without requiring a
live Dataverse seed or operator auth**. This phase is mostly tests +
docs (plus one tiny empty-state copy clarification). It pins the current
Executive demo contract so a reviewer can run the cockpit, understand
what is honest, and know exactly what is and is not wired.

No Dataverse writes, no token work, no schema changes, no entitlement
widening, no new route/access model, no manager/team entitlement proxy,
no fake runtime data, no fake profitability/revenue/ROE/yield/margin/
weighted-pipeline/win-rate/pull-through, no Copilot live connector, and
no write affordances. Phase 133C seed behavior is unchanged.

## Current shipped stack

- **Phase 133A — Executive Command Center foundation.** Board/executive
  read-only cockpit derived only from the Executive Workspace's own
  authorized slots (readiness snapshots + stage / closing-forecast
  aggregates + performance metrics). W2-isolated from manager/banker
  operational providers.
- **Phase 133B — reachability by primary workspace name.** The Executive
  Workspace appears only when the signed-in Platform User's primary
  workspace resolves to **"Executive Dashboard"**. Manager/team
  entitlement does **not** proxy executive access.
- **Phase 133C — guarded primary-workspace provisioning seed.** A
  dry-run-first, commit-gated operator script
  (`--seed-executive-primary-workspace`) that patches **only** the
  Platform User `cr664_PrimaryWorkspace` lookup. Unchanged by this phase.
- **Phase 134A — runtime verification / empty-partial honesty.** Tests
  proving route admission, no-proxy access, read-only shell, and that
  empty/partial states never fabricate exposure or KPIs.
- **Phase 134B — density pass.** Denser cockpit (exception tape, stage
  distribution, closing-forecast card, performance/profitability
  availability panel) using only existing slots, all honest.

## Demo contract (pinned by `releaseCandidateSnapshot.test.ts`)

- **Executive is primary-workspace-name gated** — only a "Executive
  Dashboard" primary workspace reaches `/workspaces/executive`.
- **Manager/team entitlement does not proxy Executive access** — there is
  no entitlement-proxy path to the executive route.
- **The Executive cockpit is dense but honest** — every metric traces to
  an existing slot; nothing is fabricated.
- **Empty/partial states are expected demo states** — they render honest
  copy, never invented numbers.
- **Live provisioning remains pending operator auth availability** — the
  Phase 133C seed is ready but needs a token/device-code session.
- **Copilot remains not-configured** unless a future connector phase
  changes it.

## Demo prerequisites

- A local checkout that builds (`npm run build`) and tests
  (`npm test`) green. No Dataverse connection, token, or seed is
  required for the no-auth demo path below.
- For the live path only: an authenticated `pac`/device-code session and
  permission to read/patch the Platform User row (see Phase 133C).

## Demo path WITHOUT live Dataverse seed/auth

The cockpit and its honesty are fully demonstrable from the test suite
and a code read, because the cockpit is a pure projection over already-
loaded slots:

1. Run `npm test -- Executive ExecutiveWorkspace WorkspaceGate workspaceEntitlements`
   to show, on screen in the test reporter:
   - the route is name-gated and non-executive users are bounced;
   - the cockpit renders the density sections from real data;
   - empty/partial states stay honest;
   - the performance/profitability panel says "Not yet wired".
2. Walk the reviewer through `ExecutiveCommandCenter.tsx` /
   `executiveDashboardCharts.ts` to show that exposure comes only from
   stage aggregates and readiness counts only from readiness rows.
3. (Optional) Mount the cockpit in a local Storybook/dev harness with
   mocked `useExecutiveData` slots — but note this is **demo scaffolding
   only**; it is not shipped runtime data and must never be presented as
   live figures.

## Demo path ONCE operator auth exists

1. Authenticate (`pac auth create --deviceCode`) and dry-run the seed:
   ```sh
   node scripts/phase122-lookup-repair.mjs \
     --seed-executive-primary-workspace \
     --upn "<pilot UPN>" --workspace-name "Executive Dashboard"
   ```
2. Re-run with `--commit-seed-executive-primary-workspace` to set the
   primary workspace.
3. Sign in as that user → land on `/workspaces/executive` and verify on
   screen (next section).

## What to verify on screen

- **`/workspaces/executive` route** — the user lands here; the workspace
  switcher shows Executive (and only otherwise-entitled workspaces).
- **Executive KPI ribbon** — active deals, total exposure (stage
  aggregate only), blocked / at-risk, operational counts.
- **Exception tape** — blocked readiness / low readiness / missing docs /
  stale deals / no readiness band, with real counts (zero buckets shown
  honestly).
- **Readiness / risk section** — readiness-band donut + risk stats.
- **Exposure-by-stage and stage-count distribution** — the $ bar and the
  deal-count bar side by side.
- **Closing forecast** — upcoming windows, or an honest empty message.
- **Operations health / data quality** — readiness-derived counts.
- **Top deals / bottlenecks** — readiness-ranked deal links.
- **Performance & profitability availability panel says "Not yet wired"**
  — only availability counts; no revenue/ROE/yield/margin figures.
- **Copilot panel says "Not configured"** if present.

## Empty-state and partial-data demo expectations

- **Fully empty** (no stage aggregates AND no readiness rows) → the
  honest empty state renders ("No authorized executive snapshot records
  found. This is an expected state…"), with **no** KPI ribbon and **no**
  fabricated sections.
- **Partial** (e.g. readiness present but no stage aggregates) → exposure
  reads **$0** (never inferred from readiness), while the risk/exception
  sections still reflect the readiness that exists.
- **Failed non-core slot** (performance or profitability) → the cockpit
  does **not** fail closed and shows the availability count as 0; only
  the three core slots (readiness + stage + closing-forecast) gate the
  cockpit closed.

## Rollback / safety note

- Phase 133C can change the primary workspace **only when auth is
  available**, and patches **only** the Platform User primary-workspace
  lookup. To roll back, re-run the seed with the prior workspace name
  (e.g. `"Banker Workspace"` or `"Manager Command Center"`).
- **No live Dataverse write is part of Phase 135A.** This phase ships
  tests + docs + one empty-state copy clarification only.

## Known limitation

- A local dry-run of the Phase 133C seed stopped at the auth safety gate
  because no token/device-code network was available (the device-code
  flow could not reach the network). This is expected: the seed is
  guarded and refuses to proceed without authentication. The live path
  resumes once an operator auth session exists.

## Explicit statements

- **No fake metrics.**
- **No runtime mock data.**
- **No access widening.**
- **No Copilot live connector.**

## Acceptance

```
npm test -- Executive ExecutiveWorkspace WorkspaceGate workspaceEntitlements releaseCandidateSnapshot
npm run build
```
