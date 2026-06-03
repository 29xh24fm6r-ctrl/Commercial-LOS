# Phase 124D — Manager workspace entitlement seed helper

## 1. Problem

Phase 124C added a workspace switcher in the Lending OS sidebar that
surfaces the **Manager Workspace** link only when
`loadManagerIdentity(upn)` resolves to `kind: 'ready'`. That probe
returns `'ready'` only when:

1. A `cr664_banker` row exists with `cr664_email = <signed-in upn>`.
2. That `cr664_banker` row has `_cr664_team_value` populated.

Once both conditions hold, the manager surface scopes its data
(`loadTeamPipeline`, `loadTeamBankers`, `loadManagerTeamTasks`,
`loadManagerTeamDocuments`, `loadManagerTeamMemos`) by the same team
id: `cr664_LoanDeal._cr664_team_value` must equal
`cr664_Banker._cr664_team_value` for a deal to appear on the manager's
team pipeline.

For the live environment the operator runs against today, the test
deal (`TEST — Deal Phase 121`) and the test banker
(`mpaller@oldglorybank.com`) are present but **neither is linked to
a Team**. So the switcher's manager link is hidden and the manager
workspace, if reached by direct URL, would render an empty team
pipeline.

## 2. Goal

Add a **guarded script mode** to
[scripts/phase122-lookup-repair.mjs](../scripts/phase122-lookup-repair.mjs)
that resolves the minimum Dataverse relationships needed for one
named UPN to access the manager workspace **end-to-end**:

- Banker → Team link
- Loan Deal → Team link

Both PATCHes go through the existing
`/api/data/v9.2/<entity-set>(<id>)` shape that Phase 122C/D/E already
use. The script never widens permissions in React, never bypasses
`WorkspaceGate`, never changes Dataverse schema, and never shows the
manager workspace to anyone who isn't already team-linked.

## 3. Command shape

### 3.1 Dry-run (default)

```powershell
node scripts/phase122-lookup-repair.mjs `
  --seed-manager-entitlement `
  --upn "mpaller@oldglorybank.com" `
  --team-name "TEST Team" `
  --deal-name "TEST — Deal Phase 121"
```

Output prints:
- Resolved Banker id + current `_cr664_team_value`
- Resolved Team id, OR a plan to POST `/cr664_teams { cr664_teamname: "TEST Team" }`
- Resolved Loan Deal id + current `_cr664_team_value`
- Numbered list of planned actions (POST team if missing; PATCH banker; PATCH deal)
- Final reminder to re-run with `--commit-seed-manager-entitlement`

### 3.2 Commit (writes)

```powershell
node scripts/phase122-lookup-repair.mjs `
  --seed-manager-entitlement `
  --upn "mpaller@oldglorybank.com" `
  --team-name "TEST Team" `
  --deal-name "TEST — Deal Phase 121" `
  --commit-seed-manager-entitlement
```

Output additionally:
- POSTs to `/cr664_teams` if the team doesn't exist
- PATCHes the Banker with body `{ "cr664_Team@odata.bind": "/cr664_teams(<teamid>)" }` (ONLY this key)
- PATCHes the Loan Deal with body `{ "cr664_Team@odata.bind": "/cr664_teams(<teamid>)" }` (ONLY this key)
- Re-reads both rows with the FormattedValue annotation and prints
  `_cr664_team_value` plus the human-readable team name for each

## 4. Required behavior (operator contract)

| Resolution probe | Zero matches | Exactly one | More than one |
|---|---|---|---|
| Banker by `cr664_email` | **bail** (no auto-create) | use it | **bail** (ambiguous) |
| Team by `cr664_teamname` | plan-to-create on commit | reuse | **bail** (ambiguous) |
| Loan Deal by `cr664_dealname` | **bail** (no invent deal) | use it | **bail** (ambiguous) |

The script never auto-creates a Banker row. If
`mpaller@oldglorybank.com` is not provisioned as a banker, the
operator must provision it via Maker Portal (or a future dedicated
banker-seed mode) before running this script.

Existing Team rows are **never mutated** — the script only POSTs a
new `cr664_team` row when none matches `--team-name`. Existing teams
keep their `cr664_description`, `statecode`, `statuscode`, owner,
etc. unchanged.

## 5. PATCH body shape

Both PATCHes carry **exactly one key**:

```json
{ "cr664_Team@odata.bind": "/cr664_teams(<teamid>)" }
```

The script does **not** touch `cr664_Client`, `cr664_stagereference`,
`cr664_statusreference`, `cr664_assignedbanker`, `cr664_amount`,
`cr664_targetclosedate`, `cr664_producttypereference`,
`cr664_loanstructuretypereference`, `cr664_pricingtypereference`, or
any other deal column. The Phase 122C loader-side hydration depends
on Dataverse returning every other column unchanged on the next GET.

## 6. Idempotency

- **Per row.** If `cr664_banker._cr664_team_value` already equals the
  resolved team id, the Banker PATCH is skipped. Same rule for the
  Loan Deal PATCH.
- **End-to-end.** If BOTH the Banker and the Loan Deal already point
  at the resolved team id, the script returns no-op success without
  issuing any POST/PATCH.

## 7. Safety guardrails

- **Dry-run default.** The script always defaults to dry-run; writes
  require the explicit `--commit-seed-manager-entitlement` flag.
- **No bypass headers.** PATCH/POST helpers send only
  `Authorization`, `OData-MaxVersion`, `OData-Version`, `Accept`,
  `Content-Type`, and (on POST) `Prefer: return=representation`. No
  `MSCRM.SuppressDuplicateDetection`, `MSCRM.BypassCustomPluginExecution`,
  `X-Override`, `force=true`, etc.
- **Single-key bodies.** Every PATCH body is a one-key object pinned
  by the contract tests; the Team-creation POST is one key
  (`cr664_teamname`).
- **No React change.** The script does not touch any file under
  `src/`. `WorkspaceGate` keeps its widened-allow check from
  Phase 124C exactly as is; the script only changes Dataverse rows
  so the gate's probe now resolves `ready`.

## 8. After running

Once the commit completes:

1. **Hard refresh** the running Code App in the browser.
2. The Phase 124C entitlement probe (`useManagerEntitlement` →
   `loadManagerIdentity(upn)`) re-runs for the signed-in UPN.
3. Because the seeded Banker now has `_cr664_team_value` populated,
   `loadManagerIdentity` returns `kind: 'ready'`, which causes
   `useEntitledRoutes()` to include `/workspaces/manager`.
4. The Lending OS sidebar switches from the static
   `CurrentWorkspacePill` to the `WorkspaceSwitcher` with two links:
   "Banker Workspace" (current) and "Manager Workspace".
5. Clicking "Manager Workspace" navigates to `/workspaces/manager`;
   `WorkspaceGate` admits because the manager route is now in
   `entitled.routes`.
6. `ManagerWorkspace` mounts; `ManagerDataProvider` queries the team
   pipeline scoped to the seeded Team. The seeded Loan Deal appears
   because its `_cr664_team_value` matches.

## 9. Contract test pins (Phase 124D)

[src/shared/governance/phase122BScriptContract.test.ts](../src/shared/governance/phase122BScriptContract.test.ts)
gains 28 new pins under three describe blocks:

- **`Phase 124D — --seed-manager-entitlement guarded write mode`**
  - Parses `--seed-manager-entitlement` + `--upn` + `--team-name` +
    `--deal-name` + `--commit-seed-manager-entitlement`
  - Each input is required when the mode is set
  - `--upn`, `--team-name`, `--commit-seed-manager-entitlement` are
    only valid alongside `--seed-manager-entitlement`
  - `--upn` refuses malformed inputs (must contain exactly one `@`)
  - 11-way mutex extended to include `--seed-manager-entitlement`
  - Mode is part of the `exclusiveModes` array

- **`Phase 124D — manager-entitlement seed runner shape`**
  - `runSeedManagerEntitlement` dispatcher with the four-input
    destructure
  - Dispatched only inside the `FLAGS.seedManagerEntitlement` branch
  - Write-mode warning header fires on
    `FLAGS.commitSeedManagerEntitlement`
  - MODE banner has both COMMIT and dry-run branches

- **`Phase 124D — finders + creators + verifier helpers`**
  - `findBankerByEmail` filters by `cr664_email` only
  - `findTeamByName` filters by `cr664_teamname` only
  - `createTeam` POSTs only `{ cr664_teamname }` — no description /
    statecode / statuscode / owner
  - `patchBankerTeam` body sets ONLY `cr664_Team@odata.bind` — and
    explicitly forbids `cr664_fullname`, `cr664_email`,
    `cr664_roletype`, `cr664_activeflag`, `_cr664_team_value`
  - `patchLoanDealTeam` body sets ONLY `cr664_Team@odata.bind` —
    explicitly forbids `cr664_Client`, `cr664_stagereference`,
    `cr664_statusreference`, `cr664_assignedbanker`, `cr664_amount`,
    `cr664_producttype`, `cr664_loanstructure`, `cr664_pricingtype`,
    `cr664_targetclosedate`
  - `readBankerTeamLink` and `readLoanDealTeamLink` request only
    FormattedValue annotation; no bypass/suppress/override headers

- **`Phase 124D — dry-run + commit-gate behavior`**
  - Dry-run returns BEFORE any write helper is reachable
  - Zero / duplicate Banker bail (no auto-create, no ambiguous pick)
  - Zero / duplicate Loan Deal bail
  - Duplicate Team bails; zero-match Team plans-to-create
  - Idempotency: both-already-linked → no-op success
  - Verify step prints formatted-value annotation for both rows
  - Summary references the Phase 124C switcher reveal
  - Helper region carries no bypass/suppress/force-header values

The pre-existing 270 Phase 122B/D/E contract tests are unchanged
except for two mutex-string pins (now reference the 11-way mutex) +
one slice boundary (now extends through the Phase 124D block).

## 10. Acceptance

- [x] Dry-run prints a safe plan (resolve Banker / resolve Team /
      resolve Deal / planned actions) without any POST/PATCH
- [x] Commit links Banker + Loan Deal to the same Team via single-key
      `cr664_Team@odata.bind` PATCHes
- [x] After hard refresh, Phase 124C switcher exposes "Manager
      Workspace" for the seeded UPN
- [x] `npm test -- src/shared/governance/phase122BScriptContract.test.ts`
      green (298/298)
- [x] `npm run build` green
- [x] No React code change; no schema change; no permission widening;
      no bypass headers
