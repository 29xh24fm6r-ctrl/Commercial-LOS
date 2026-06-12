# Phase 164 -- V1.0 Controlled Pilot Release Package

Date: 2026-06-12

This is the final V1.0 controlled-pilot release package. It is
documentation only. No features were added, no schema or migrations were
introduced, no Dataverse records were created, no connector was enabled,
no permission was widened, and the route delta is 0.

## 1. Release Baseline Commit

- Baseline: `4937b42` Phase 163 document Stage Status reference blocker.
- Branch: master (origin/master).
- This package is cut on top of `4937b42`. The Phase 164 commit adds only
  this package and its cross-references.

## 2. V1.0 Included Scope

- Banker Command Center surfaces: dashboard, active deals, tasks, due
  diligence, activity, relationships, alerts, and signals.
- Banker Deal Cockpit with the existing governed task, document, credit
  memo, and communication write surfaces.
- Manager, Team, Portfolio, Executive, and Admin workspaces under their
  existing permission gates.
- CRM Command Center read-only preview surface and its drill-through
  detail panels (six interaction detail cards).
- Log Activity governed write (Phase 160): banker-authorized deal note
  that writes to the canonical Dataverse timeline event table with audit
  and timeline refresh, enabled only for governed-write-entitled bankers.
- V1.0 documentation and certification set: Phase 158 audit, Phase 159
  New Deal governed-write audit, Phase 161 smoke certification, Phase 162
  release-candidate readiness, Phase 163 Stage/Status reference blocker,
  and the V1.0 release notes.

## 3. V1.0 Disabled / Post-V1 Scope

- + New Deal create: disabled (see the known blocker in section 4).
- Stage/Status reference data-source registration: not done (the unblock
  task for New Deal; documented in Phase 163).
- Document Upload: disabled, pending a File column on
  cr664_DocumentChecklist and an upload pipeline.
- Global Search: disabled, not wired (search input is a disabled
  placeholder with an honest tooltip).
- Remaining Phase 158 P2/P3 backlog: Stage Progression, Borrower Portal,
  CRM live connector, Copilot live connector, and the Schedule, Contacts,
  Vendors, Settings, and Help sidebar routing placeholders.

## 4. Known Blocker

+ New Deal cannot be safely enabled until the Stage Reference and Status
Reference lookup target tables are registered as Power Apps data sources
and the generated SDK is refreshed. The cr664_loandeal create payload
requires `cr664_StageReference@odata.bind` and
`cr664_StatusReference@odata.bind` (both required lookups), but the target
reference table is not registered in `power.config.json` /
`dataSourcesInfo.ts`, has no generated model or service, and its
entity-set name is not even verifiable from the repository. No safe,
deterministic default can be resolved without guessing GUIDs, which is
prohibited. + New Deal therefore stays disabled with an honest tooltip.
Full analysis and the exact registration task are in
docs/PHASE_163_STAGE_STATUS_REFERENCE_UNBLOCK.md.

## 5. Live Power Apps Smoke Checklist

Run against the deployed Power Apps environment after promoting the
baseline build. Each step is pass/fail; any failure is a no-go for the
pilot until resolved.

1. App opens (no crash, no white screen).
2. App reloads cleanly (hard refresh returns to a working state).
3. Banker Workspace renders with real banker data (no placeholder rows).
4. Sidebar / navigation works across the banker tabs.
5. CRM Command Center is visible as a read-only preview surface.
6. All six CRM Command Center drill-through cards open their detail
   panels.
7. Log Activity opens for a governed-write-entitled banker.
8. Log Activity saves against a selected authorized deal (write succeeds
   or shows an honest failure state -- no silent local substitute).
9. Dashboard / Activity surface refreshes after a successful Log Activity.
10. + New Deal is disabled and shows the honest Stage/Status blocker
    tooltip.
11. No fake data is visible anywhere (no fabricated metrics or rows).
12. No live CRM or Copilot connector is claimed in the UI unless it is
    actually configured in the environment (both remain read-only /
    not-configured for the pilot).

## 6. Rollback Plan

- Doc-only issue: `git revert` the Phase 164 release commit and redeploy;
  no runtime behavior changes.
- Runtime issue: redeploy the prior known-good build artifact /
  environment package (the pre-Phase-164 baseline at `4937b42` runtime is
  identical, since Phase 164 ships no runtime code). If a regression is
  traced to an earlier phase, revert to that phase's last green build and
  re-run this smoke checklist.
- After any rollback, confirm the banker dashboard returns to real data
  with no local placeholder rows and that Log Activity / + New Deal states
  match this package.

## 7. Final Go / No-Go

- GO for controlled pilot if + New Deal create being disabled is
  acceptable for V1.0. All included surfaces are governed, honest, and
  read-only where not explicitly a governed write; the only governed write
  in the pilot is Log Activity.
- NO-GO if + New Deal create is a mandatory V1.0 capability. It cannot be
  safely enabled within this app's allowed delta and requires the
  environment/schema/SDK registration work in section 4 first.

Recommendation: GO for a controlled pilot with + New Deal accepted as
disabled-for-V1.0, contingent on the section 5 live smoke checklist
passing in the target environment.
