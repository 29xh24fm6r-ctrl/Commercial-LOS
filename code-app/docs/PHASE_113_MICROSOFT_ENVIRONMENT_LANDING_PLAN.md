# Phase 113 — Microsoft Environment Landing Plan

**Status:** Documentation + repository-inspection phase. **No
production code or governance changes ship in this phase.** The
deliverable is this doc + a light governance pin
(`src/shared/governance/microsoftEnvironmentLandingPlan.test.ts`)
+ small pointer updates in three sibling docs.

**The actual blocker right now is not app feature readiness — it
is environment landing.** Phases 104–112 produced a green local
build, a release-locked communication lane, and a human-executable
validation script. None of that is exercisable in a real Microsoft
Power Platform environment until the Code App is actually
deployed there. This doc captures the concrete repository facts,
the prerequisites, the deployment paths, and the failure-triage
table needed to get the app landed and launched.

**Audience:** Matt, as solo operator. Written so a single person
can move through it sequentially with no parallel work assumed.

---

## A. Current repository facts (from inspection at end of Phase 112)

### A.1 Deployment / config files that EXIST

| Path | Purpose | State |
| --- | --- | --- |
| `code-app/power.config.json` | Power Apps Code App config (data sources + connector refs + environment id) | Present. `appId: null` — **not yet bound to a published Code App in the target environment.** |
| `code-app/package.json` | npm scripts + Microsoft SDK deps | Present. `dev` / `build` / `test` / `lint` / `preview` only. **No `deploy` / `publish` / `pac` script.** |
| `code-app/vite.config.ts` | Vite build config | Present. Minimal — React plugin + port 3000. |
| `code-app/index.html` | Vite entry HTML | Present. |
| `code-app/dist/` | Build output directory | Present after `npm run build`; matches `buildPath` in power.config.json. |
| `code-app/src/generated/services/` | Typed Power Apps SDK services | Present, 24 service files (22 Cr664_* + `Office365OutlookService` + `SystemusersService`). |
| `code-app/src/generated/models/` | Typed Power Apps SDK models | Present. |
| `code-app/src/generated/index.ts` | Re-exports of all generated services | Present. |
| `../solution.zip` (parent project root) | Previous Power Apps solution export | Present, 2.3 MB. Schema source-of-truth for the bank's Dataverse tables. |
| `../src/Other/Solution.xml` | Unpacked solution manifest | Solution: `CommercialLendingLOS`, publisher prefix `new`, version `1.1.0.1`, unmanaged, ~140 root components (tables, the Code App, a model-driven app). |
| `../src/CanvasApps/cr664_commerciallendingapp_952eb.meta.xml` | Previous Code App meta from the solution export | Present. **Note: `ConnectionReferences: {}` at export time — the Outlook connector was not registered when this snapshot was taken.** |
| `../src/CanvasApps/cr664_commerciallendingapp_952eb_CodeAppPackages/` | Previously-published Code App bundle assets | Present (index.html + hashed JS/CSS + favicon). Stale — predates Phases 104–112. |
| `../src/AppModules/new_OGBLendingModelDriven/AppModule.xml` | Companion model-driven app in the solution | Present. |

### A.2 Deployment / config files that are MISSING

| Missing | What this means | Owner |
| --- | --- | --- |
| `package.json` `deploy` / `publish` script | No documented one-command deploy path. The Power Apps CLI commands have to be invoked manually. | Phase 113 documents the commands; future docs-only phase can add scripts. |
| Operator-facing README deployment section | `code-app/README.md` is the boilerplate Vite template — no Power Apps context. | Phase 113 §G covers the operator sequence; future docs-only phase can fold a short section into README. |
| `pac` config / cached auth profile | Not committed (correctly — auth tokens must not be in source control). Each operator authenticates locally. | Operator runs `pac auth create` (§D). |
| `.env` / `.env.local` for `VITE_EMAIL_MODE` | Not in repo (correctly — env values are deployment-time choices). `VITE_EMAIL_MODE` defaults to `DRY_RUN` when unset. | Operator decides per deployment (§D). |
| Bound `appId` in `power.config.json` | The current value is `null`. Once published the first time, `pac` will populate it. | Auto-populated by `pac code push` on first publish. |
| Connector consent in target environment | Office 365 Outlook connector `new_Office365OutlookCommercialLOS` is referenced but consent / connection creation happens in the maker portal at publish time. | Operator (§B / §D). |

### A.3 npm scripts present

```bash
npm run dev          # vite dev server on http://localhost:3000
npm run build        # tsc -b && vite build  → produces ./dist
npm run lint         # eslint . (full ruleset)
npm run preview      # vite preview of ./dist (smoke-runs the build locally)
npm test             # vitest run (full suite, 2548+ tests at end of Phase 112)
npm run test:watch   # vitest in watch mode
```

There is no `deploy`, `publish`, `push`, or `pac` script. The
Phase 113 §D command checklist covers each step explicitly.

### A.4 Microsoft SDK / package usage

```jsonc
"dependencies": {
  "@microsoft/power-apps": "^1.1.3",   // typed Dataverse + connector client
  "@microsoft/teams-js": "^2.53.0",     // Phase 86 diagnostic Teams probe only
  "react": "^19.2.6",
  "react-dom": "^19.2.6",
  "react-router-dom": "^7.15.0"
}
```

`@microsoft/power-apps` is the runtime that consumes
`power.config.json` and wires `Cr664_*Service` / `Office365OutlookService`
calls to the live Dataverse + connector. It expects to run inside
a hosted Code App context where the Power Apps host provides
environment metadata.

### A.5 Dataverse tables the app expects (from `power.config.json`
`databaseReferences.default.cds.dataSources`)

22 tables referenced at build time:

```
cr664_losuserprofile        cr664_loandeal              cr664_borrower
cr664_platformuser          cr664_platformworkspace     cr664_workspaceentitlements
systemuser                  cr664_banker                cr664_dealtask1
cr664_documentchecklist     cr664_creditmemo1           cr664_creditmemodraftsection
cr664_dealtimelineevent     cr664_team                  cr664_profitabilitysnapshot1
cr664_dealreadinesssnapshot cr664_performancemetric     cr664_profitabilityrefreshstatus
cr664_dataqualityflag       cr664_auditevent            cr664_alertqueue
cr664_systemsetting         cr664_kpithresholdconfiguration
```

The parent solution at `../src/Other/Solution.xml` ships ~140
root components total (140+ tables, the Code App itself, and a
model-driven app companion). The app references only the 22 above
— the rest are present in the schema but not currently consumed
by typed services.

### A.6 Connectors the app expects

One:

| Connector | Logical name | Connection reference id | Purpose |
| --- | --- | --- | --- |
| Office 365 Outlook | `new_Office365OutlookCommercialLOS` | `586e00e0-a566-4c27-9ad8-17ea650a6b39` | `SendEmailV2` for the Phase 104 document-request and Phase 105 borrower-update LIVE paths, plus the Phase 109 smoke-test card. **Phase 110 lock forbids any other connector method.** |

### A.7 Environment variables the app uses

| Variable | Read at | Default | What it controls |
| --- | --- | --- | --- |
| `VITE_EMAIL_MODE` | build time (Vite injects into bundle) | `DRY_RUN` | When `LIVE`: `liveAdapter.send()` calls `Office365OutlookService.SendEmailV2`. When `DRY_RUN`: the adapter synthesizes "accepted" locally, no network call. |

`VITE_*` variables are baked into the bundle at `npm run build`
time. **Changing `VITE_EMAIL_MODE` requires a rebuild AND a
republish** — there is no runtime toggle.

### A.8 Existing docs that mention deployment / Power Platform

- This doc (`PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md`) is
  the first comprehensive deployment plan.
- `PHASE_106_EMAIL_MODE_RELEASE_READINESS.md` — operator promotion
  checklist (§4) walks the operator through CI gates + in-app
  gates, but assumes the app is already running in the
  environment.
- `PHASE_109_EMAIL_LIVE_SMOKE_TEST.md` — operator workflow (§6)
  walks through the smoke-test card, but assumes the app is
  already running.
- `PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md` — the
  human-executable script for §A.1 pre-flight onward, but its
  Section A explicitly assumes the operator is already signed
  into the deployed app.
- `docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md` — mentions
  `pac code add-data-source` as a future operator step for adding
  the Stage Reference table.
- `docs/RELEASE_NOTES_PHASES_1_40.md` — Phase 41 candidate
  references `pac code add-data-source` for schema regeneration.

No doc walks the operator through the publish / push / launch
sequence for the Code App itself. **Phase 113 is that doc.**

---

## B. Required Microsoft prerequisites

The operator must confirm each of these before attempting a
publish. Each prerequisite has a check command in §D.

| # | Prerequisite | Why | How to confirm |
| --- | --- | --- | --- |
| B.1 | A Power Platform environment to land in | The Code App must live inside an environment (id is in `power.config.json`). | `pac admin list` → the environment id `5f2d77a5-de50-edeb-9d74-5b2400a2320d` (or a different target id) must appear. |
| B.2 | Code Apps feature is available in that environment | Code Apps is a managed Power Apps feature; not every environment supports it. | Power Platform admin center → environment settings → confirm Code Apps is on the feature list. If not, request feature enablement. |
| B.3 | Dataverse is enabled in that environment | The 22 tables in §A.5 are Dataverse tables. The app cannot read or write without Dataverse. | Maker portal → environment → confirm a database is provisioned. |
| B.4 | The expected solution (`CommercialLendingLOS`) is imported AND the tables in §A.5 exist | The app's typed services target specific entity set names; absent tables fail at runtime with "table not found". | Maker portal → environment → Solutions → confirm `CommercialLendingLOS` is present. Open one of the §A.5 tables and confirm it exists. |
| B.5 | Power Apps CLI (`pac`) is installed locally | The publish path uses `pac code push` (or equivalent). | `pac --version` returns a version string (1.40+ recommended for `pac code` commands). |
| B.6 | An authenticated maker / admin account that can publish to the target environment | `pac code push` requires write access to the environment. | `pac auth list` shows an authenticated profile pointing at the target env. |
| B.7 | Office 365 Outlook connector consent (only required for LIVE mode) | The Phase 104 / 105 LIVE paths call `SendEmailV2` through this connector. | Maker portal → environment → Connections → confirm an Office 365 Outlook connection exists AND consent is granted to the publishing user (or the bank's service principal). Without this, LIVE smoke test (Phase 109 / 112) will fail with permission error. |
| B.8 | `VITE_EMAIL_MODE` value decided | Build-time bake-in. | Before `npm run build` for a deploy bundle: `set VITE_EMAIL_MODE=DRY_RUN` (default) or `set VITE_EMAIL_MODE=LIVE`. Recommend DRY_RUN for first publish (§G.5). |

**Assumptions documented (Phase 113 brief out-of-scope rule):**
- Assumption A1: the target environment id in
  `power.config.json` (`5f2d77a5-de50-edeb-9d74-5b2400a2320d`) is
  the correct first-publish target. If you publish to a different
  environment, update that field FIRST. The environment id is
  baked into the published Code App.
- Assumption A2: the solution `CommercialLendingLOS` has been
  imported at least once into the target environment so the
  schema in §A.5 exists. If not, see §D step 8 for the
  solution-import path.
- Assumption A3: the publishing user has both Dataverse System
  Customizer (or higher) AND the Power Apps "Code Apps" feature
  flag granted. Without both, `pac code push` returns access
  denied.
- Assumption A4: Code Apps requires a managed environment for
  most tenants. Confirm with the bank's Power Platform
  administrator before assuming a personal-developer environment
  will work.

---

## C. Deployment path options

Three options, ranked by recommended-first.

### Option 1 — Code App publish path (RECOMMENDED for this repo)

This is the path `power.config.json` is configured for. It
publishes the bundled React app into the target environment as a
Power Apps Code App, registers it under the solution publisher
prefix, and binds the appId on first push.

**Why this is the recommended path:**
- The repo is already configured as a Code App
  (`power.config.json` is the Code Apps configuration manifest).
- The previous solution at `../src/CanvasApps/` was published as
  a Code App (`CanvasAppType: 4`) so the bank's environment
  already understands this pattern.
- Publishing is a single `pac code push` command after auth.
- Connection consent + binding happen at publish time through
  the maker portal — no separate solution import step.

**Steps:**

1. Local build → `npm run build` → confirms TypeScript + Vite
   complete clean and produce `./dist`.
2. Local test → `npm test -- --run` → confirms all 2548+ tests
   pass.
3. Authenticate with `pac auth create --environment <id>` (§D.2).
4. Confirm environment with `pac admin list` (§D.3).
5. Confirm environment matches `power.config.json.environmentId`.
6. Run `pac code push` from the `code-app/` directory (§D.6).
7. After push: confirm the app appears in the maker portal under
   the target environment.
8. First-launch validation (§E).
9. If LIVE: run the Phase 109 smoke test before any banker work.
10. If everything green: run the Phase 112 operator validation
    script.

### Option 2 — Solution import path

Use this when the operator wants to package the Code App AS PART
OF a solution (alongside the model-driven app + tables + option
sets) and import that solution into the target environment.

**When to use:**
- The target environment doesn't have the
  `CommercialLendingLOS` solution at all (fresh environment).
- The bank's release process requires solution-based promotion
  between dev / test / prod environments.
- You want managed-vs-unmanaged decisions to live with the
  schema, not with the Code App publish.

**Steps:**

1. Build the Code App locally → `npm run build`.
2. Pack the Code App bundle into the solution structure under
   `../src/CanvasApps/cr664_commerciallendingapp_<suffix>_CodeAppPackages/`
   (this is the structure the prior publish at
   `../src/CanvasApps/cr664_commerciallendingapp_952eb_CodeAppPackages/`
   shows).
3. Update the AppVersion + the `<CodeAppPackageUris>` list in the
   `.meta.xml` to point at the new bundle filenames.
4. Pack the solution with `pac solution pack` → produces a new
   `solution.zip`.
5. Decide managed vs unmanaged:
   - **Unmanaged** (recommended for dev): publisher can edit
     directly in the maker portal. Use for the first deploy and
     for any environment where Matt is the only one editing.
   - **Managed** (recommended for prod): immutable in the target
     environment; harder to drift. Use once dev/test is stable.
6. Set environment variables in the solution (the parent
   solution at `../src/` has none currently; if you add them
   for `VITE_EMAIL_MODE`, that's a Solution Manifest edit, not
   a Code App config edit — and currently `VITE_EMAIL_MODE` is
   build-time-baked so this isn't useful for it).
7. Import the solution via `pac solution import` or the maker
   portal "Import solution" upload.
8. Publish customizations.
9. Verify the Code App appears in the environment and launches.
10. First-launch validation (§E).

**Trade-off:** more steps than Option 1, but the bank's release
process may require it.

### Option 3 — Temporary standalone web host (FALLBACK ONLY)

> **This option does NOT satisfy full Microsoft / Power Apps
> integration.** The app's `@microsoft/power-apps` runtime calls
> Dataverse + the Outlook connector through the Power Apps host
> SDK — not through a generic web fetch. Hosting the bundle on a
> static site (Azure Static Web Apps, Vercel, S3 + CloudFront,
> etc.) gives you a URL that loads the React shell, but Dataverse
> reads / writes WILL fail because the host has no Power Apps
> SDK context to authenticate against.

**Use this option only if:**
- Option 1 + Option 2 are blocked at the environment level
  (e.g., Code Apps not yet enabled in any environment Matt has
  access to) AND
- You only need to demo the static UI (no real data, no real
  sends) AND
- You will revert to Option 1 / 2 before any release-candidate
  validation.

**Steps:** (deliberately abbreviated — this is a fallback only)
1. `npm run build`
2. Upload `dist/` to any static host.
3. Open the URL.
4. **Confirm what you see is the SHELL ONLY.** All Dataverse
   reads will fail with a missing-host error; all writes will
   fail; the Outlook smoke test will fail.
5. **Phase 112 cannot be completed against an Option 3
   deployment.** §A.2 of Phase 112 will fail at "build deployed
   into target environment" because there is no Power Platform
   environment binding.

---

## D. Exact command checklist

Run these in order from `C:\Users\MatthewPaller\projects\powerapp-project\code-app`
(Windows / PowerShell — adapt syntax for bash if needed). Each
command has an "expected" and a "fail-if".

### D.1 Confirm Power Platform CLI is installed

```bash
pac --version
```

**Expected:** prints a version string (1.40+ recommended).
**Fail if:** "pac is not recognized as an internal or external
command" → install Power Platform CLI from the Microsoft docs
site (`https://aka.ms/PowerPlatformCLI`).

### D.2 Authenticate to the target Power Platform environment

```bash
# Interactive — opens a browser for sign-in
pac auth create --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d

# OR, if you want to pass a different environment id at this step:
pac auth create --environment <target-env-id>
```

**Expected:** browser prompts for Entra sign-in; on success
returns "Authentication profile created."
**Fail if:** "Could not connect to the environment" → check the
environment id (§B.1 + Assumption A1). "Access denied" → the
account lacks Dataverse System Customizer or Code Apps feature
access (Assumption A3).

### D.3 List available environments

```bash
pac admin list
```

**Expected:** prints a table including the target environment by
id and friendly name.
**Fail if:** target environment isn't listed → either the
authenticated account doesn't have access to that environment,
or the id is wrong.

### D.4 Select the target environment (sets it as the active org for subsequent commands)

```bash
pac org select --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d
```

**Expected:** "Selected environment 'CommercialLendingLOS' (or
similar friendly name)."

### D.5 Local build (with the right `VITE_EMAIL_MODE`)

For first publish (recommended):

```bash
# PowerShell
$env:VITE_EMAIL_MODE='DRY_RUN'
npm run build
```

For a LIVE-mode publish (only after first publish + Phase 109
smoke test passed):

```bash
$env:VITE_EMAIL_MODE='LIVE'
npm run build
```

**Expected:** `tsc -b` exits clean; Vite produces `./dist` with
`index.html` + hashed JS + hashed CSS. Final line approximately:
`✓ built in <ms>`.
**Fail if:** TypeScript errors → not a deployment problem; fix
locally and re-run. Vite error → check `vite.config.ts` syntax.

### D.6 Local test (the structural gate before publish)

```bash
npm test -- --run
```

**Expected:** 2548+ tests pass. If you see fewer tests than
expected, you're on a commit older than Phase 112.
**Fail if:** any test fails → do NOT publish. Investigate the
failing test (see Phase 112 §I for which phase doc owns which
kind of failure).

### D.7 Publish the Code App

```bash
# Run from inside the code-app/ directory
pac code push
```

**Expected:** `pac` reads `power.config.json`, uploads the
`./dist` bundle, registers the connector reference, binds the
appId on first push, and prints a success URL.
**Fail if:**
- "power.config.json not found" → wrong CWD.
- "Environment id mismatch" → the active org from D.4 doesn't
  match `power.config.json.environmentId`. Update one to match.
- "Connection reference 'new_Office365OutlookCommercialLOS' not
  found" → the Outlook connector reference doesn't exist in the
  target environment yet. Create it in the maker portal first
  (Connections → New connection → Office 365 Outlook), then
  re-run.
- "JSON Parse error: Unexpected EOF" — see §F.
- "Solution not found" → see Option 2 / §G.2.

### D.8 (Only if Option 2) Pack and import the solution

```bash
# Pack the solution from ../src into a zip
pac solution pack --zipfile ../solution.zip --folder ../src

# Import
pac solution import --path ../solution.zip --publish-changes true
```

**Expected:** import completes; "Solution imported successfully."

### D.9 Verify the Code App appears in the environment

Open the maker portal at
`https://make.powerapps.com/environments/5f2d77a5-de50-edeb-9d74-5b2400a2320d/apps`.

**Expected:** "Commercial Lending LOS (Rebuild)" appears in the
app list with a recent timestamp.
**Fail if:** the app isn't there → §D.7 failed silently; re-run
with `--verbose`.

### D.10 Launch the app

In the maker portal, click the app. **Or** navigate directly to
the published URL (`pac code push` prints it).

**Expected:** the app loads to the role-appropriate workspace
(see §E).

---

## E. First-launch validation checklist

These are the in-app gates the operator checks immediately after
the first successful publish. They are a subset of Phase 112 §B
— do them BEFORE running the full Phase 112 script. If any fail,
fix here; don't proceed to Phase 112.

- [ ] **E.1** App loads (no fallback "you don't have access"
  screen, no infinite spinner).
- [ ] **E.2** **No JSON Parse / Unexpected EOF error in console
  or on screen.** This usually indicates `power.config.json`
  served stale, or a connector reference is missing in the target
  environment. See §F row 1.
- [ ] **E.3** Workspace routing resolves to the role-appropriate
  workspace within a few seconds.
- [ ] **E.4** Dataverse reads succeed (the deal list / work
  queue / activity rows render with content, not "failed to
  load").
- [ ] **E.5** Admin Workspace opens (sign in as admin identity).
- [ ] **E.6** Release Readiness Gate card renders (top of admin
  workspace).
- [ ] **E.7** Email LIVE Diagnostics card renders (between Stage
  Governance Diagnostics and Performance Diagnostics).
- [ ] **E.8** Mode badge on the diagnostics card matches the
  `VITE_EMAIL_MODE` value baked at §D.5.
- [ ] **E.9** **DRY_RUN works before any LIVE attempt.** Open
  the Banker Deal Workspace; trigger one document-request email
  and one borrower-update email in DRY_RUN mode. Confirm both
  produce "Outlook accepted" outcome panels and that activity
  rows appear in the Borrower Communication card.
- [ ] **E.10** **LIVE smoke test only AFTER E.9 passes.** If
  Step D.5 used `VITE_EMAIL_MODE=LIVE`, open the Outlook LIVE
  Email Diagnostics card and run the smoke test against a
  non-borrower test inbox. Confirm acceptance + verify the test
  inbox actually received the message.

If E.1–E.8 all pass and E.9 (DRY_RUN) works: the environment
landing is successful for DRY_RUN. The Phase 112 operator script
can run against this build.

If you also want LIVE: do E.10. If E.10 passes: the environment
landing is successful for LIVE. The Phase 112 operator script
can run against this build with LIVE expectations.

---

## F. Failure triage table

Each row: likely cause, where to check, next action. Ordered by
"how often does this come up" — common stuff first.

### F.1 `JSON Parse error: Unexpected EOF`

| Field | Detail |
| --- | --- |
| **Likely cause** | `power.config.json` was served truncated OR a connection reference is unresolvable AND the Power Apps SDK is trying to parse an empty response from the host as JSON. |
| **Where to check** | Browser dev tools → Network tab → look for a failed request to a `/api/config` or connector-metadata endpoint that returned empty / 500. Also confirm `code-app/power.config.json` is intact locally (not truncated by a save). |
| **Next action** | (1) Reopen `code-app/power.config.json` and confirm it ends with a closing `}`. (2) Confirm the Office 365 Outlook connection in §B.7 exists in the target environment. If it doesn't, the connector reference resolves to nothing and the SDK errors out at parse time. (3) Re-run `pac code push` after fixing. |

### F.2 App blank / frozen on first load

| Field | Detail |
| --- | --- |
| **Likely cause** | (a) The Power Apps host failed to inject environment metadata. (b) The bundle was served from a stale CDN cache. (c) A pre-bootstrap query (`loadDealForBanker` / `runBootstrap`) threw and the app didn't render its error fallback. |
| **Where to check** | Browser dev tools → Console for any uncaught error. Network tab for any 4xx/5xx in the first few requests. |
| **Next action** | (1) Hard-refresh (Ctrl+F5) to bypass cache. (2) If still frozen: re-run `pac code push` to force a fresh upload. (3) If still frozen: check the bootstrap query's expected Dataverse table (`cr664_user` or `cr664_platformuser`) exists in the target environment. |

### F.3 Workspace / routing not resolved (spinner never resolves, or "Access not provisioned" / "Workspace not recognized" error renders)

| Field | Detail |
| --- | --- |
| **Likely cause** | One of three things: (a) `runBootstrap()` cannot resolve the signed-in user's Entra UPN to a row in `cr664_platformuser` (Phase 115 identity entry point) — most often because the maker-portal grid silently dropped a new row due to a hidden required field (Phase 116 §3.3 grid pitfall); (b) the user's `cr664_PrimaryWorkspace` points at a workspace name that isn't in the [Phase 116 §1 alias table](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md#1-the-live-environments-six-platform-workspace-names) and contains no role keyword — Phase 116's substring fallback fails closed; (c) the legacy `cr664_user` table's broken `PrimaryWorkspace` FK in the live env (do NOT attempt to populate that table — Phase 115 §2 explains why). |
| **Where to check** | (1) AuthGate's `"Access not provisioned — No LOS profile exists for <upn>"` (NotProvisionedError) OR `"Workspace not recognized — Your assigned workspace '<name>' is not a known landing target"` (UnresolvedWorkspaceError) — the error message tells you which failure mode. (2) Maker portal → environment → Tables → `cr664_platformuser` → confirm a row exists with `cr664_email` = the signed-in UPN AND `cr664_PrimaryWorkspace` set to one of the six live Platform Workspace names listed in [PHASE_116 §1](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md#1-the-live-environments-six-platform-workspace-names). |
| **Next action** | For NotProvisionedError: follow [PHASE_115 §3](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) for the Platform User row + [PHASE_116 §3](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md#3-live-provisioning-recipe-platform-user--banker) for the Banker row, **using the row form editor NOT the inline grid** ([PHASE_116 §3.3](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md#33-recommended-provisioning-approach-avoiding-the-grid-pitfall) explains the grid-drop pitfall). For UnresolvedWorkspaceError: confirm the user's Platform Workspace name matches one of the six in [PHASE_116 §1](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md#1-the-live-environments-six-platform-workspace-names) exactly (case doesn't matter; spelling does). |

### F.4 Generated service import failure (e.g. `Cr664_loandealsService is not defined`)

| Field | Detail |
| --- | --- |
| **Likely cause** | The bundle was built but a generated service file is missing or empty. Usually means `npm run build` was interrupted, or the `src/generated/` directory was stale at build time. |
| **Where to check** | Confirm `code-app/src/generated/services/` contains 24 files (22 Cr664_* + Office365OutlookService + SystemusersService). Also check `dist/` has fresh hashed JS bundles (timestamp matches your build). |
| **Next action** | `npm run build` from scratch, then `pac code push` again. |

### F.5 Connector unavailable / `Office365OutlookService.SendEmailV2` throws

| Field | Detail |
| --- | --- |
| **Likely cause** | The Office 365 Outlook connection in the target environment isn't consented for the publishing user, OR the connection reference logical name in `power.config.json` (`new_Office365OutlookCommercialLOS`) doesn't match what was created in the maker portal. |
| **Where to check** | Maker portal → environment → Connections → confirm an Office 365 Outlook connection exists AND its logical name matches `new_Office365OutlookCommercialLOS`. |
| **Next action** | (1) If the connection doesn't exist: create it. (2) If the logical name differs: either rename the connection's logical name (rare; may not be possible) OR update `code-app/power.config.json` to match the actual logical name, then `npm run build` + `pac code push`. (3) Re-run the Phase 109 smoke test once the connector is consented. |

### F.6 Dataverse table missing

| Field | Detail |
| --- | --- |
| **Likely cause** | The target environment doesn't have one of the 22 tables in §A.5. Most likely the `CommercialLendingLOS` solution wasn't imported, or was imported into a different environment. |
| **Where to check** | Maker portal → environment → Tables → confirm the specific missing table is present. |
| **Next action** | Import the solution: `pac solution import --path ../solution.zip --publish-changes true`. Or in the maker portal: Solutions → Import → upload `../solution.zip`. |

### F.7 Permission denied (Dataverse read or write)

| Field | Detail |
| --- | --- |
| **Likely cause** | The signed-in user is not in a Dataverse security role that grants read/write on the affected table. The app intentionally surfaces this honestly via the Access Denied path. |
| **Where to check** | Maker portal → environment → Users + permissions → confirm the signed-in user has at least System Customizer (or a more narrow role that covers the Phase 105 inventory of tables). |
| **Next action** | Adjust the security role; refresh the app. |

### F.8 Solution import failure

| Field | Detail |
| --- | --- |
| **Likely cause** | Missing dependencies. The parent `Solution.xml` lists two `MissingDependencies` (e.g. `msdyn_/Images/AppModule_Default_Icon.png`, `AppChannel` setting). Imports fail when dependencies aren't satisfied. |
| **Where to check** | Import dialog → "Missing dependencies" expandable section. |
| **Next action** | Install the required upstream packages (AppModule Web Resources, PowerAppsAppFramework). These are standard Microsoft solution dependencies; they ship with most environments by default but may need explicit install in fresh environments. |

### F.9 Environment variable missing (`VITE_EMAIL_MODE` not picked up)

| Field | Detail |
| --- | --- |
| **Likely cause** | `VITE_EMAIL_MODE` was set in a different shell than the one that ran `npm run build`, OR the build was cached and reused a stale env-injected bundle. |
| **Where to check** | In the deployed app's Outlook LIVE Email Diagnostics card → read the mode badge. If it says the wrong value, the bundle has the wrong env baked in. |
| **Next action** | (1) Clear `dist/` (`rm -rf dist/` or `Remove-Item dist -Recurse`). (2) Set `$env:VITE_EMAIL_MODE='LIVE'` (or `'DRY_RUN'`) in the SAME PowerShell session you'll run `npm run build` in. (3) `npm run build`. (4) `pac code push`. |

### F.10 Office 365 Outlook consent failure (LIVE smoke test fails with 401/403)

| Field | Detail |
| --- | --- |
| **Likely cause** | The connection in the maker portal exists but consent wasn't granted for the publishing user OR for the runtime user identity. |
| **Where to check** | Maker portal → environment → Connections → the Office 365 Outlook connection → "Status" column. |
| **Next action** | Open the connection, click "Fix connection" / re-authenticate. Re-run Phase 109 smoke test. If it now succeeds: proceed with Phase 112 §E + §F. |

---

## G. One-person execution mode (solo operator sequence)

Matt as solo operator. Sequential — do not parallelize. Stop the
moment a step fails; capture evidence (Phase 112 §H template
works for this too); resolve before proceeding.

### G.1 Create / confirm the target environment

- Open Power Platform admin center.
- Locate the environment matching
  `power.config.json.environmentId` (`5f2d77a5-de50-edeb-9d74-5b2400a2320d`).
- If it doesn't exist: create a new Dataverse-enabled
  environment, update `power.config.json.environmentId` to the
  new id, and commit that change.
- Confirm Code Apps is enabled in the environment (Assumption A4).
- **Stop and pause if:** Code Apps isn't enabled. File an admin
  request before continuing.

### G.2 Prove the schema is in place

- Maker portal → environment → Solutions.
- If `CommercialLendingLOS` is present: open it, confirm the 22
  tables in §A.5 are all there.
- If absent: `pac solution import --path ../solution.zip
  --publish-changes true`.
- Spot-check: open the `cr664_loandeal` table in the maker
  portal, confirm at least one column you recognize from the
  schema (e.g. `cr664_dealname`).
- **Stop and pause if:** any §A.5 table is missing AND the
  solution import fails. This is a schema gap, not a deployment
  problem — file against the schema team.

### G.3 Prove app package / publish

- From `code-app/`:
  - `$env:VITE_EMAIL_MODE='DRY_RUN'` (always start DRY_RUN — see
    G.5 for LIVE later).
  - `npm test -- --run` → must pass.
  - `npm run build` → must complete clean.
  - `pac auth create --environment <id>` (§D.2) if not already
    authenticated.
  - `pac code push` (§D.7).
- Read `pac` output for the published app URL.
- Maker portal → confirm app appears.
- **Stop and pause if:** `pac code push` returns any error.
  Triage via §F.

### G.4 Prove app launches

- Click the app in the maker portal (or open the published URL).
- Run through §E.1–E.8.
- Capture a screenshot of the Admin Workspace + the Email LIVE
  Diagnostics card showing `Mode: DRY_RUN`.
- **Stop and pause if:** any §E.1–E.8 check fails. Triage via
  §F.

### G.5 Prove DRY_RUN works

- Run §E.9: trigger one document-request email and one
  borrower-update email on a test deal in DRY_RUN mode.
- Verify both produce "Outlook accepted" outcomes and activity
  ledger rows appear with the masked recipient.
- Confirm no `delivered` / `email sent` / forbidden phrases
  appear in the rendered UI (the Phase 110 lock guarantees this
  at CI; you're spot-checking the deployed app).
- **Stop and pause if:** DRY_RUN doesn't produce the expected
  rows OR uses forbidden vocabulary. This indicates a deploy-
  time bundle staleness or a config drift; re-run §G.3 with a
  cleared `dist/`.

### G.6 Prove LIVE smoke test

- Confirm the Office 365 Outlook connector + consent are in
  place (§B.7).
- Decide: do you want to flip the deployment to LIVE now?
  - **If yes:** rebuild with `$env:VITE_EMAIL_MODE='LIVE'` →
    `npm run build` → `pac code push`. The deployed app will
    now have `Mode: LIVE`.
  - **If no:** stay in DRY_RUN; LIVE is a separate later
    deployment.
- If you flipped to LIVE: open the Outlook LIVE Email
  Diagnostics card → run the smoke test against a non-borrower
  test inbox → confirm "Connector accepted" outcome → confirm
  the test inbox actually received the message.
- **Stop and pause if:** the smoke test fails OR the test inbox
  didn't receive. Triage via §F.5 / §F.10.

### G.7 Only then run Phase 112 operator validation

- Once G.1–G.6 are all green, open
  [`PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md`](PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md)
  and execute the full eleven-section script.
- Capture the §H evidence record.
- If everything passes: the release candidate is validated
  against this environment.
- If anything fails: file against the owning phase doc per
  Phase 112 §I.

---

## H. What Phase 113 does NOT do

- **No production source change.** No new card, no new modal, no
  new governed write, no Outlook adapter change. The Phase 110
  release lock would catch any drift.
- **No new env vars.** `VITE_EMAIL_MODE` is the only one and it
  exists from Phase 61.
- **No schema change.** §A.5 lists what's in
  `power.config.json` today; if the operator discovers a table
  truly missing during §G.2, that's a schema-team ticket, not a
  Phase 113 deliverable.
- **No new access-model logic.** The bootstrap chain
  (`runBootstrap` → `loadDealForX`) is unchanged. The Phase 113
  failure triage (§F.3) just documents how to fix it when the
  signed-in user isn't in `cr664_users`.
- **No Microsoft environment assumptions left undocumented.** §B
  lists every prerequisite explicitly; Assumptions A1–A4 are
  called out as named assumptions, not silent ones.

---

## I. Cross-references

- [STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md) — pointer block updated in this phase to name Phase 113 as the current true blocker.
- [PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md](PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md) — §4 updated to require Phase 113 environment landing before any operator validation.
- [PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md](PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md) — Phase 113 is the prerequisite phase: until §G.1–G.6 are green, Phase 112 cannot execute.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the lock that makes the deployed-in-environment app safe to validate. Failure in §F should not trigger code changes to the locked surfaces; it should trigger environment / config changes.
- [PHASE_109_EMAIL_LIVE_SMOKE_TEST.md](PHASE_109_EMAIL_LIVE_SMOKE_TEST.md) — the in-app smoke test §G.6 uses.
- [PHASE_106_EMAIL_MODE_RELEASE_READINESS.md](PHASE_106_EMAIL_MODE_RELEASE_READINESS.md) — the operator promotion checklist that §G.7 leads into.
- [STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md) — adjacent doc that uses `pac code add-data-source` for a different purpose; useful syntax reference.
- `../src/Other/Solution.xml` — the unpacked parent solution manifest. Source of truth for the schema during a §D.8 import.
- `../solution.zip` — the packed solution. Used by `pac solution import` in §D.8.

The shortest possible summary of this doc, for fast re-entry:

> *"The app is green locally. The blocker is not code. The blocker
> is that we have not yet proven we can publish the Code App into
> a Microsoft Power Platform environment. Phase 113 is the
> document that proves we can — once §G.1–G.7 are green, the
> Phase 112 operator script can run for real."*
