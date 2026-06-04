# Phase 131A — Release candidate final validation & pilot checklist

**Purpose.** The final validation package for a controlled team pilot
of the Commercial Lending LOS Code App. No new features. This document
is the single operator-facing source for what to verify, how to deploy,
what to expect, what is deliberately out of scope, and how to roll back.

It complements (does not replace) the earlier operator scripts:
- [PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md](PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md) — step-by-step in-env validation.
- [PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md) — publish/landing mechanics.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) — Dataverse seed click-through.
- [PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md](PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md) — surface completion matrix.

---

## 1. Release candidate identity

| Field | Value |
|---|---|
| **Top commit** | `5939799 Phase 130B Copilot demo polish and connector readiness` |
| Branch | `master` |
| App display name | Commercial Lending LOS (Rebuild) |
| `appId` (bound) | `63858e09-3d0b-47c9-b1d2-65cef742fda4` |
| Environment id | `5f2d77a5-de50-edeb-9d74-5b2400a2320d` |
| Build entry | `./dist` / `index.html` (`power.config.json`) |

### Validation run (this phase)

| Gate | Command | Result |
|---|---|---|
| Unit / integration / governance tests | `npm test` | **PASS — 3692 tests across 164 files** |
| Production build | `npm run build` (`tsc -b && vite build`) | **PASS — clean** |

The only build advisory is the pre-existing main-chunk size warning
(>500 kB), which is informational, not a failure.

> Re-run both gates against the **exact deployed commit** before
> promotion (PHASE_112 §A).

---

## 2. Deployment command sequence

Publishing is a `pac code push` from the `code-app/` directory. There
is intentionally **no** `deploy`/`push` npm script — publishing is an
operator action with an authenticated `pac` profile, not a CI hook.

```sh
# 0. From the code-app/ directory, on commit 5939799.

# 1. Decide the email mode for the bundle (build-time bake-in).
#    Recommend DRY_RUN for the pilot (no live borrower email).
set VITE_EMAIL_MODE=DRY_RUN        # PowerShell: $env:VITE_EMAIL_MODE = 'DRY_RUN'

# 2. Build → produces ./dist (must be clean).
npm run build

# 3. Authenticate to the target environment (one-time per machine).
pac auth create --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d

# 4. Confirm the environment is reachable.
pac admin list

# 5. Publish. Binds appId on first push; re-push is idempotent.
pac code push
```

Prerequisites: `pac --version` ≥ 1.40 (for `pac code` commands); a
maker/admin account with publish rights to the environment; the Code
Apps feature enabled in the environment. See PHASE_113 §B for the full
pre-flight table.

After push, launch the app from the Power Apps maker portal (Apps →
Commercial Lending LOS) and sign in.

---

## 3. Workspace walkthrough (pilot acceptance per surface)

The deployed environment seeds six Platform Workspace names that
resolve to five routes plus the per-deal cockpit. A pilot user lands on
the workspace matching their seeded Platform Workspace entitlement.

| Platform Workspace name | Route | What the pilot user should see |
|---|---|---|
| `Banker Workspace` | `/workspaces/banker` | Lending OS shell (dark sidebar), greeting header, KPI deck, stage-grouped pipeline, action queue, due diligence, activity, relationships, signals tabs. Opening a deal → per-deal cockpit. **Write-enabled** (tasks, documents, credit-memo draft, borrower email). |
| `Team Workspace` | `/workspaces/team` | Team Ops Queue (10-tile ribbon + lanes + execution board), shared pipeline, autopilot rollup, bottlenecks, closing calendar. **Read-only.** Copilot panel near the top. |
| `Manager Command Center` | `/workspaces/manager` | Manager Bloomberg Control Panel (command strip + analytics grid + exception tape + banker workload + top deals), catch-up, autopilot rollup, relationship memory. **Read-only.** Copilot panel near the top. |
| `Portfolio Management` | `/workspaces/manager?surface=portfolio` | Portfolio Command Center (exposure ribbon, concentration charts, top exposures, exceptions) on the manager route. **Read-only.** Copilot panel near the top. |
| `Executive Dashboard` | `/workspaces/executive` | Board-safe portfolio snapshots + production roll-up. **Read-only, no drill-through.** (`PipelineByStage` / `MonthlyClosingForecast` may show transitional-fallback copy — see §6.) |
| `Admin Control Center` | `/workspaces/admin` | Release Readiness Gate, system health, data-quality flags, audit anomalies, alert backlog, config overview, stage-governance diagnostics, email-live diagnostics, performance diagnostics. Alert/DQ resolve are **write-enabled**; settings are read-only. |

**Per-deal cockpit** (`/deals/:dealId`): reachable for banker (RW),
manager (RO), and team (RO). Executive/admin deal drill-through return
an explicit denial by design.

**Hydrated labels:** confirm a seeded deal shows the live Dataverse
display values (e.g. `TEST Client`, `TEST · Stage Phase 121`,
`TEST — Status Phase 121`, assigned banker name) and **no raw GUIDs**
and **no fake placeholders**. Missing fields read honestly ("Not set" /
"Unassigned" / "No amount").

---

## 4. Copilot Assist — not-configured expectation

Copilot Assist is **visible but inert** in this pilot. There is **no
live connector** and there must be none.

On every surface the pilot user should observe:
- A **Copilot Assist** panel with a cobalt accent stripe and a
  **"Not configured"** status pill.
- Subtitle: "Connector not configured — local summaries only."
- Footer: "Copilot connector not configured. Local summaries only. No
  AI. No external calls." and "Read-only assistant. Cannot approve,
  change data, or send communications."
- The deal cockpit panel opens **expanded**; command-center panels open
  **collapsed** (compact) but show the status pill.
- Quick actions (Summarize / Explain blockers / etc.) produce a **local
  summary** card tagged "Local summary — Not AI-generated. Not a
  recommendation," generated only from data already on screen.

**Must NOT appear:** a "Connected" pill, any "Powered by Microsoft
Copilot" live copy, any network/AI call, or any write/send affordance.
The recommended live-connector path (Dataverse custom API → Azure
OpenAI) is documented in
[PHASE_130B_COPILOT_CONNECTOR_READINESS.md](PHASE_130B_COPILOT_CONNECTOR_READINESS.md)
and is intentionally **not** activated.

---

## 5. Dataverse seed prerequisites

The app reads already-authorized Dataverse data; it does not seed
itself. Before the pilot, confirm these are seeded (see PHASE_121 /
122D / 122E / 124D checklists for the click-through):

1. **Identity** — `cr664_platformuser` rows for each pilot user, mapped
   to a seeded `cr664_platformworkspace` (one of the six names in §3),
   and `cr664_workspaceentitlements` for any multi-workspace users.
   A `cr664_banker` row (by UPN/email) is required for banker / manager
   / team identity resolution; the banker must have a `cr664_Team`.
2. **Reference lookups** — Stage Reference, Status Reference, Product
   Type, Loan Structure, Pricing Type rows (PHASE_122E) so deals
   hydrate display labels rather than empty/GUID values.
3. **Borrowers / clients** — `cr664_borrower` (+ `cr664_clientrelationship`
   per PHASE_122D) for client-name hydration and relationship surfaces.
4. **Deals** — `cr664_loandeal` rows on the pilot team, non-terminal
   (`statecode = 0`, `cr664_isterminalstatus` false/null), with
   `cr664_Team`, `cr664_AssignedBanker`, stage/status lookups, amount,
   target close date.
5. **Child data (optional but recommended)** — `cr664_dealtask1` and
   `cr664_documentchecklist` rows (note the PHASE_121/122 lookup
   retarget caveat) so the work queues, ribbons, and Copilot local
   summaries show non-zero counts.
6. **KPI thresholds** — `cr664_kpithresholdconfiguration` for the
   manager/executive analytics where applicable.

A pilot with identity + reference lookups + a handful of hydrated deals
is sufficient to exercise all six surfaces.

---

## 6. Known limitations (deliberate, in-scope for pilot)

These are governed non-goals, not defects. Full matrix in
[MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md)
and the inventory (`platformInventory.ts`: 12 governed writes / 16
local-only flows / 8 not-wired / 1 deliberately-blocked).

- **Copilot:** not-configured; local summaries only (see §4).
- **Email:** recommend `VITE_EMAIL_MODE=DRY_RUN` for the pilot. LIVE
  send (document-request + borrower-update via `SendEmailV2`) exists
  and is governed, but the pilot should not send live borrower mail
  until explicitly approved.
- **Borrower portal:** not built (`NOT_WIRED.borrower-portal`, compound
  external-identity block).
- **Binary document upload / preview:** not wired (schema: no File
  column). Document workflow is metadata-only (request / receive /
  review).
- **Advance Stage write:** `DELIBERATELY_BLOCKED.stage-progression-advance`
  (needs stage-reference schema). Stage display works; advancing does
  not.
- **Executive transitional surfaces:** `PipelineByStage` /
  `MonthlyClosingForecast` may render transitional-fallback copy until
  snapshot entities exist.
- **Teams / calendar / push:** only no-admin copy-to-clipboard / mailto
  handoffs; no Graph, no push, no calendar sync.
- **Executive / admin deal drill-through:** intentionally denied.

---

## 7. Go / No-Go checklist

Tick every row before greenlighting the pilot.

- [ ] `npm test` passes on the deployed commit (3692/3692).
- [ ] `npm run build` is clean on the deployed commit.
- [ ] Bundle built with the intended `VITE_EMAIL_MODE` (DRY_RUN for pilot).
- [ ] `pac code push` succeeded; app launches from maker portal.
- [ ] Each pilot user resolves to the correct workspace (no
      unresolved-workspace error, no silent demotion).
- [ ] At least one seeded deal hydrates real labels (no GUIDs, no fake
      placeholders) across banker / manager / portfolio / team.
- [ ] Per-deal cockpit opens for banker/manager/team; exec/admin denial
      is honest.
- [ ] Copilot panel shows **Not configured** on all four surfaces; no
      "Connected" pill, no network call.
- [ ] Read-only surfaces expose **no** write affordances (manager /
      portfolio / team / executive).
- [ ] Admin Release Readiness Gate shows no critical blocker.
- [ ] Unauthorized URL-hacking (foreign deal, borrower page) is blocked.
- [ ] No `.claude/` or other local-agent artifact in the deployed bundle.

**No-Go triggers:** any test/build failure on the deployed commit; a
workspace that fails to resolve; GUID/fake data leaking into a surface;
a Copilot "Connected"/live state; any unexpected write affordance on a
read-only surface; a critical Release Readiness blocker.

---

## 8. Rollback notes

- **App rollback:** `pac code push` publishes a bundle; to roll back,
  rebuild from the previous known-good commit and re-push. Identify the
  prior RC via `git log` (the commit before `5939799`). The push is
  idempotent and re-binds the same `appId`.
- **No destructive data migration** ships in this RC — there is no
  schema change and no new write action, so a rollback is a pure
  front-end bundle swap. Existing Dataverse rows are untouched.
- **Email safety:** if a LIVE bundle was pushed by mistake, rebuild with
  `VITE_EMAIL_MODE=DRY_RUN` and re-push; the mode is baked at build time.
- **Seed rollback:** seed data is operator-managed in Dataverse and is
  independent of the app bundle; no app-side rollback step is required
  for seed changes.
- Capture the deployed commit hash and `pac code push` output with each
  publish so the prior bundle is always reproducible.

---

## 9. Post-pilot feedback capture checklist

Collect per pilot user / per session:

- [ ] Role / workspace(s) the user landed on.
- [ ] Did the correct workspace resolve on first sign-in? (Y/N + detail)
- [ ] Any label that showed a GUID, blank, or wrong value (screenshot +
      deal name).
- [ ] Any surface that failed to load / errored (surface + message).
- [ ] Copilot: was the not-configured state clear and trustworthy? Were
      the local summaries useful? What would they ask a live Copilot?
- [ ] Most valuable surface / least valuable surface.
- [ ] Any moment the user expected to take an action but couldn't
      (maps to a known limitation in §6 vs. a genuine gap).
- [ ] Performance: any slow load or stall (surface + rough timing).
- [ ] Accessibility: keyboard/screen-reader friction.
- [ ] Top 3 requested changes (rank).

Triage routing: data/label issues → seed or hydration; "can't act"
→ check §6 (deliberate) vs. backlog; Copilot asks → feed the
PHASE_130B connector decision; surface errors → defect queue.

---

## 10. Confirmations

- No new features, no Dataverse schema change, no connector activation,
  no new write action in this phase.
- Copilot live connector remains **not configured** (default adapter).
- `.claude/` is git-ignored and not committed.
- `npm test` and `npm run build` both pass on `5939799`.
