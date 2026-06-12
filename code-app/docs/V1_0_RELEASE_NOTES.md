# V1.0 Release Notes

Date: 2026-06-12

The final controlled-pilot release package -- baseline commit, included
and disabled scope, live smoke checklist, rollback plan, and go/no-go --
is docs/PHASE_164_V1_CONTROLLED_PILOT_RELEASE_PACKAGE.md (baseline
`4937b42`).

## Final Release Tag

- Release tag: `v1.0.0-controlled-pilot`
- Tagged commit: `faf26d6` Phase 166 fix dashboard KPI card interactions
- Deployment: Phase 167 PAC `pac code push` to environment
  `5f2d77a5-de50-edeb-9d74-5b2400a2320d` succeeded.
- Smoke: operator live smoke passed in the deployed app, including the
  Phase 166 KPI-card interaction fix (Pipeline / Active Deals / Urgent /
  In UW open their honest destinations; the not-yet-wired and
  no-destination cards are honestly non-clickable).
- Accepted limitation: + New Deal is disabled for V1.0 due to the
  Stage/Status reference blocker documented in Phase 163. This is the
  single documented, honestly-disabled limitation accepted for the
  controlled pilot.
- Post-V1 unblock path: register the Stage Reference / Status Reference
  data sources, refresh the generated SDK, add a fail-closed default
  resolver, then wire governed + New Deal create. See
  docs/PHASE_163_STAGE_STATUS_REFERENCE_UNBLOCK.md.

Release status: V1.0 controlled pilot tagged and smoke-passed.

## Production-Ready Surfaces

- Banker Workspace dashboard, active deals, tasks, due diligence, activity, relationships, alerts, and signals.
- Banker Deal Cockpit with governed task, document, credit memo, and communication write surfaces.
- Manager, Team, Portfolio, Executive, and Admin workspaces with existing permission gates.
- CRM Command Center read-only preview surface and drill-through details.
- Governed writes currently shipped in `GOVERNED_WRITES`, including Phase 160 Log Activity.

## Preview-Only Surfaces

- CRM Command Center and CRM intelligence remain read-only preview surfaces.
- Copilot shell remains not configured; no live model connector is enabled.
- Portfolio boarding persistence remains adapter-gated where documented.

## Disabled Post-V1 Surfaces

- New Deal create is disabled pending a generated stage/status reference data source or canonical default resolver.
- Global Search remains disabled.
- Document Upload remains disabled pending a file column and upload pipeline.
- Stage Progression remains blocked by the stage-reference ordering/schema gap.
- Borrower Portal remains deferred pending external auth, token, role, file, message, and notification prerequisites.
- CRM live sync and Copilot live connector remain disabled.

## Known Limitations

- New Deal cannot safely create `cr664_loandeal` records because required Stage Reference and Status Reference lookup values are not resolvable in the generated app SDK. Phase 163 confirmed the reference lookup target table is not registered, not generated, and not verifiable from the repo (Case C); see docs/PHASE_163_STAGE_STATUS_REFERENCE_UNBLOCK.md. V1.0 go requires formally accepting + New Deal as disabled-for-V1.0.
- Log Activity requires at least one active banker-authorized deal to select.
- KPI tiles that depend on unavailable schema fields remain honestly marked not wired.
- Secondary sidebar items for Schedule, Contacts, Vendors, Settings, and Help remain disabled placeholders.

## Validation Snapshot

- `npm test`: passed, 448 files / 7625 tests.
- `npm run build`: passed with the existing large-chunk warning.
- Delta lint for the new Log Activity/header/governance files: passed.
- Repo-wide `npm run lint`: not green due pre-existing lint debt outside the Phase 160 delta.
- Route delta: 0.

## Operator Smoke Checklist

1. Sign in and confirm workspace resolution.
2. Open Banker Workspace and confirm real data loads.
3. Confirm + New Deal is disabled with the Stage/Status reference blocker.
4. Log Activity on an active deal and confirm the Activity surface refreshes.
5. Open Active Deals, Tasks & Actions, Due Diligence, Activity, Relationships, My Alerts, and Signals.
6. Confirm CRM Command Center remains read-only/preview-only.
7. Confirm manager/team/portfolio/executive routing remains permission-gated.
8. Reload and confirm the banker dashboard returns to real data with no local placeholder rows.

## Rollback Plan

1. Revert the Phase 160 Log Activity commit.
2. Redeploy the previous green build.
3. Confirm `GOVERNED_WRITES` returns to the prior inventory count and Log Activity is disabled.
4. Re-run the smoke checklist for read-only V1.0 surfaces.
