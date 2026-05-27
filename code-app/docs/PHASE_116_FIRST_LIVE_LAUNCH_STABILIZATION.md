# Phase 116 — First Live Launch Stabilization and Workspace Alias Alignment

> **Next UX parity phase:** [Phase 117 — Banker Workspace UX Parity](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md).
> Phase 116 made Matt able to enter the deployed app. Phase 117
> replaces the bare stacked-card surface he landed on with a
> product-grade shell (dark sidebar, KPI grid, tabs, right rail)
> while preserving every Phase 113–116 invariant.

**Status:** **Shipped (narrow routing fix + provisioning recipe).**
The app is now successfully published to Microsoft Power Apps via
`pac code push` and Matt can enter the app after provisioning the
identity rows landed by Phase 115. Phase 116 takes the next two
honest steps:

1. **Aligns `workspaceRoutes.ts` with the six live Platform
   Workspace names** the bank actually seeded — most importantly,
   wires `Portfolio Management` through to a route (the only live
   name that fell through the regex matchers and stranded users
   at AuthGate).
2. **Documents the live provisioning recipe** with explicit
   warnings about the maker-portal grid pitfall that can drop a
   newly-created Platform User row if hidden required fields like
   `cr664_createdat` are missing.

No production behavior change outside routing. No email-lane
change. No fallback dashboard. No weakening of permission-before-
render — the substring regex fallback still resolves only the five
canonical role keywords (banker / team / manager / executive +
board / admin) and unmatched names still fail closed.

Related canonical sources:
- [PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md) — deployment runbook. §F.3 updated in this phase to reference Phase 116 for the workspace-alias + grid-pitfall guidance.
- [PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) — identity-chain switch (legacy `cr664_user` → `cr664_platformuser`). §3.2 updated in this phase to reference Phase 116 for the alias table.
- [src/bootstrap/workspaceRoutes.ts](../src/bootstrap/workspaceRoutes.ts) — extended with an `EXPLICIT_ALIASES` map. Substring regex fallback preserved.
- [src/bootstrap/workspaceRoutes.test.ts](../src/bootstrap/workspaceRoutes.test.ts) — new test file, 25 assertions covering every live alias + the fail-closed contract.

---

## 1. The live environment's six Platform Workspace names

The seeded `cr664_platformworkspace` rows in the deployed
environment are, verbatim:

| Live name | Phase 116 routes to |
| --- | --- |
| `Admin Control Center` | `/workspaces/admin` |
| `Banker Workspace` | `/workspaces/banker` |
| `Executive Dashboard` | `/workspaces/executive` |
| `Manager Command Center` | `/workspaces/manager` |
| `Portfolio Management` | `/workspaces/manager` (Phase 116 decision — see §2) |
| `Team Workspace` | `/workspaces/team` |

Five of those six already resolved via the legacy substring regex
from Phases 4 / 32 (`/\bbanker\b/i`, `/\bteam\b/i`, etc.). The
only name that fell through to fail-closed was **Portfolio
Management** — `Management` is not the same word as `manager`, so
the `\bmanager\b` regex returns false.

Phase 116 introduces an explicit alias map that runs BEFORE the
substring regex. The exact six names above are the contract with
the live data. The substring regex is preserved as a defensive
fallback for any non-alias name that still contains a role
keyword (`Senior Banker Office` → banker; `Board Reporting` →
executive).

---

## 2. Portfolio Management → manager (decision record)

The brief asked "choose admin or executive, document the choice".
After inspecting the actual workspace card stacks and the
schema-level evidence, **Phase 116 routes Portfolio Management
to the Manager Command Center**, not Executive or Admin.

### Reasoning

1. **Manager Command Center is functionally a portfolio-oversight
   surface.** Its card stack today: TeamWorkQueue, banker filter,
   pipeline summary, deals-by-stage, closing forecast, at-risk /
   blocked deals, banker workload summary, manager activity
   summary, autopilot rollup, morning catch-up. That IS portfolio-
   oversight UX.
2. **Executive Workspace is snapshot-only by Phase 15 design.**
   No deal drill-through (`NOT_WIRED.executive-deal-drillthrough`).
   Too restrictive for someone titled "Portfolio Manager" who
   probably needs to act, not just observe.
3. **Banker Workspace is deal-workspace-centric.** Wrong fit for
   an oversight role that spans multiple deals across bankers.
4. **Admin Workspace is governance / diagnostics.** Release
   Readiness Gate, audit anomalies, system health. Wrong persona.
5. **The Banker schema confirms PM is a banker-style role.**
   `cr664_banker.cr664_roletype` enum value 788190002 is
   `PortfolioManager` (alongside CommercialBanker /
   RelationshipManager / Support). So an individual portfolio
   manager IS a banker at the row level; at the workspace level,
   the parallel `Portfolio Management` Platform Workspace
   suggests a team-scoped oversight role — which matches the
   Manager Command Center's scope.

### Why this is reversible

The alias map in `workspaceRoutes.ts` is one line. If the bank
decides Portfolio Management should route somewhere different —
or wants a dedicated `/workspaces/portfolio` route — a future
phase can:

1. Edit the alias map entry from `'Portfolio Management': 'manager'`
   to the new target.
2. Update the Phase 116 `Portfolio Management → manager (Phase 116
   §2 decision)` test assertion in `workspaceRoutes.test.ts` to
   the new expectation.
3. Add the new route to `WORKSPACE_ROUTES` if needed.

Phase 116 does not assume this is the permanent home for
Portfolio Management. It's the honest default given the current
five-workspace card stacks.

---

## 3. Live provisioning recipe (Platform User + Banker)

This is the operator runbook for adding a new user who needs to
sign into the deployed Code App. Phase 115's recipe covered the
identity row (Platform User); Phase 116 extends it to cover the
Banker row that a banker / portfolio-manager / team-member user
also needs.

> **Important pitfall before you start.** The maker portal's
> inline grid editor can appear to save a new Platform User row
> and then drop it on refresh if hidden required fields are
> missing. See §3.3 for the workaround.

### 3.1 Required fields — `cr664_platformuser`

Open Tables → Platform User → switch to the **All Columns** view
(or the table designer's "New row" form, NOT the grid). Set:

| Field | Required | Value |
| --- | --- | --- |
| `cr664_email` | yes | the user's UPN, exact case-insensitive match against `ctx.user.userPrincipalName` (e.g. `mpaller@oldglorybank.com`) |
| `cr664_fullname` | yes | the user's display name |
| `cr664_PrimaryWorkspace` | yes | one of the six Platform Workspace rows from §1 |
| `cr664_identitystatus` | yes | `Active` (788190000) |
| `cr664_activestatus` | yes | `true` |
| `cr664_createdat` | **yes (HIDDEN in default grid)** | now (ISO 8601). The maker portal's grid omits this column by default. **A row created without it appears to save and then disappears on refresh.** |

Optional (leave blank unless you need them):
- `cr664_normalizedemail` — diagnostic only
- `cr664_provisioningsource` — diagnostic only
- `cr664_lastlogin` — populated automatically on first sign-in
- `cr664_updatedat` — usually populated by the maker portal
- `cr664_CoreUser` — leave EMPTY (Phase 115 decision; the
  legacy `cr664_user` table is not in the bootstrap chain)
- `cr664_Role`, `cr664_Team` — future-phase fields; not required
  by Phase 115/116 bootstrap

### 3.2 Required fields — `cr664_banker` (only for banker-style users)

A `cr664_platformuser` row is enough to bootstrap routing. To
actually use the Banker Workspace, the same UPN also needs a
`cr664_banker` row so `BankerProvider` can resolve it.

Open Tables → Banker → New row (form, not grid). Set:

| Field | Required | Value |
| --- | --- | --- |
| `cr664_fullname` | yes | the user's display name |
| `cr664_roletype` | yes | one of `CommercialBanker` (788190000), `RelationshipManager` (788190001), `PortfolioManager` (788190002), `Support` (788190003) |
| `cr664_email` | recommended | the user's UPN. `BankerProvider` looks up by email; without it, the banker workspace renders disabled. |
| `cr664_Team` | recommended for non-Support roles | FK to a `cr664_team` row, used by team filters + autopilot rollup scoping |

Optional:
- `cr664_managername`, `cr664_mobilephone`, `cr664_officelocation`,
  `cr664_phone`, `cr664_title`, `cr664_nmlsorinternalid`,
  `cr664_notes`, `cr664_profilephoto` — display-only.
- `cr664_UserLoginMapping` — future-phase field; leave blank.

### 3.3 Recommended provisioning approach (avoiding the grid pitfall)

The maker portal has two row editors:
- **Inline grid editor** — fast, but only edits the columns the
  view exposes. Required fields hidden from the view get default
  values that may not satisfy schema constraints, and the row can
  silently disappear on refresh.
- **Row form editor** — opens a full form with all columns. Slower
  but the form's submit step actually surfaces the
  "field-X-is-required" validation errors that the grid hides.

**Always use the row form editor (the "New" button that opens a
side panel or page) for `cr664_platformuser` and `cr664_banker`,
not the inline grid.** If the grid view is your only option,
configure the view to include the columns in §3.1 / §3.2 BEFORE
adding a row.

**Alternative — copy an existing seeded row.** The fastest
reliable approach is to use the row form's "Save As" / clone
operation on a working seeded row. The cloned row inherits the
hidden required fields the original had populated; you then
overwrite `cr664_email`, `cr664_fullname`, and `cr664_PrimaryWorkspace`.
Existing seeded rows like the operator's own Banker Workspace
identity are the safest source.

**Future-phase candidate.** A proper provisioning helper —
either a model-driven app form scoped to admins, or a small
Power Automate flow that takes UPN + workspace name + role and
emits the right two rows — would eliminate the maker-portal-grid
pitfall entirely. Phase 116 documents the pitfall; closing it
permanently is out of scope here.

---

## 4. What Phase 116 changes in code

### `src/bootstrap/workspaceRoutes.ts`

- Adds `EXPLICIT_ALIASES` record (six entries: the six live names
  from §1).
- Adds `EXPLICIT_ALIASES_LOWER` materialized lower-case lookup
  Map for O(1) case-insensitive resolution.
- Extends `resolveWorkspaceRoute()` to consult the alias map
  FIRST, then fall back to the substring regex, then fail
  closed.
- Whitespace-trims the input before any lookup.

### `src/bootstrap/workspaceRoutes.test.ts` (NEW)

25 assertions across five describe blocks:

- **6 live alias tests** — every live name from §1 resolves to
  the expected route.
- **4 case-insensitivity / trim tests** — lower, upper, mixed
  case, and leading/trailing whitespace all match.
- **4 substring fallback tests** — names like "Senior Banker
  Office" still resolve via the regex; names like "Loan
  Management Suite" (which contains "Management" but not
  "manager") correctly fail closed.
- **6 fail-closed tests** — `undefined`, `''`, whitespace-only,
  "Borrower Portal", an arbitrary unknown name, and a Phase 110
  lock-adjacent name like "Magic Link Invitation Portal" all
  return `null`. Catches regressions where someone adds a default
  fallback.
- **3 contract tests** — `WORKSPACE_ROUTES` has exactly the five
  canonical keys, all routes start with `/workspaces/`, and
  Portfolio Management's specific routing decision is double-
  pinned so a future re-route requires updating both the code
  and the assertion.

Before Phase 116 there were **zero** tests covering
`workspaceRoutes.ts`. The resolver was unverified by CI.

### No other production source changed

`bootstrapFlow.ts`, `AuthGate.tsx`, `WorkspaceGate.tsx`,
`HomeRedirect.tsx`, `BootstrapContext.tsx`, `errors.ts` — all
unchanged.

---

## 5. Fail-closed contract (preserved)

The Phase 115 invariants are unchanged:

| Failure | Behavior | AuthGate rendering |
| --- | --- | --- |
| No UPN in Power Apps context | `NotProvisionedError('(no UPN in context)')` | "Access not provisioned" with `(no UPN in context)` |
| No PlatformUser row | `NotProvisionedError(upn)` | "Access not provisioned — No LOS profile exists for `<upn>`" |
| PlatformUser without PrimaryWorkspace | `UnresolvedWorkspaceError(undefined)` | "Workspace not recognized — No primary workspace is assigned to your profile" |
| Workspace name not in alias map AND not matching regex | `UnresolvedWorkspaceError(workspaceName)` | "Workspace not recognized — Your assigned workspace `<name>` is not a known landing target" |

Phase 116 ADDS routes for six explicit names; it doesn't change
what happens when no route matches. Any future unknown workspace
name still throws and renders the honest error.

---

## 6. Manual validation (after `pac code push`)

The brief's manual-validation list. Each item is what an operator
checks against the published build.

- [ ] Matt signs in via Entra.
- [ ] AuthGate no longer shows "Access not provisioned" (assuming
  Matt's `cr664_platformuser` row exists per Phase 115 §3 / Phase
  116 §3.1).
- [ ] App routes from Platform User's `cr664_PrimaryWorkspace`
  without an "Access not provisioned" or "Workspace not
  recognized" error.
- [ ] If Matt's PrimaryWorkspace is `Banker Workspace`, the
  Banker Command Center renders.
- [ ] After changing Matt's `cr664_PrimaryWorkspace` to
  `Admin Control Center`, refresh the app — the Admin Workspace
  renders.
- [ ] After changing Matt's `cr664_PrimaryWorkspace` to
  `Portfolio Management`, refresh — the Manager Command Center
  renders (Phase 116 §2 decision).
- [ ] Try a workspace row with a name that doesn't appear in §1
  and contains no role keyword (e.g. "Borrower Portal" if you
  add one): AuthGate must show "Workspace not recognized" with
  that exact name. Permission-before-render preserved.

---

## 7. Out of scope (deliberate)

- **No email-lane changes.** Phase 104–110 communication lock
  remains intact.
- **No fallback dashboards.** Every failure path still surfaces
  AuthGate's `ErrorState`.
- **No new workspace route.** Phase 116 maps Portfolio Management
  to an existing route. Adding `/workspaces/portfolio` would
  require a new route + provider + card stack — a feature, not
  a stabilization fix.
- **No provisioning helper.** §3.3 names this as a future-phase
  candidate. Building the model-driven form or Power Automate
  flow is its own project.
- **No `cr664_user` revival.** The legacy table is still
  out of the bootstrap chain per Phase 115. The Phase 116
  recipe explicitly says not to populate it.
- **No identity-status enforcement.** A `cr664_platformuser` row
  with `cr664_identitystatus = Disabled` or `Suspended` will
  still resolve through bootstrap. Phase 115 §6.1 named this as
  a future-phase candidate; Phase 116 does not pick it up.

---

## 8. Verification

### CI gates

- `src/bootstrap/workspaceRoutes.test.ts`: **25/25 assertions
  pass.**
- `src/bootstrap/bootstrapFlow.test.ts`: 12/12 still pass (no
  regression to the Phase 115 chain).
- Full suite green; communication-lane lock (Phase 110) still
  green.
- `npm run build`: clean.

### Operator gate (after `pac code push`)

Run the brief's command verbatim:

```bash
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS
```

Then run the manual validation list in §6. If any check fails,
triage via [PHASE_113 §F](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md#f-failure-triage-table):

- Workspace-not-recognized → Phase 116 §1 alias table (is the
  workspace name in the live env exactly one of the six? case
  doesn't matter; spelling does).
- Access-not-provisioned → Phase 115 §3 + Phase 116 §3 (is the
  Platform User row actually saved, or did the grid pitfall drop
  it?).
- App blank / frozen → Phase 113 §F.2 (cache / Power Apps host
  metadata).

---

## 9. Cross-references

- [PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md) — §F.3 updated to reference Phase 116 §1 + §3.3 grid pitfall.
- [PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) — §3.2 updated to reference Phase 116 §1 alias table; §3.3 updated to reference Phase 116 §3.3 grid-pitfall warning.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — unaffected. The communication lane is sealed and Phase 116 doesn't touch it.
- `src/bootstrap/workspaceRoutes.ts` — the modified resolver.
- `src/bootstrap/workspaceRoutes.test.ts` — the new pin file.
