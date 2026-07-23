# Final Seven Workstreams — Deployment and Rollback Plan

Companion to `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md` (the overall sequencing) and
`docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md` (deployment mechanics). This document
covers only what's specific to this pass's 7 workstreams.

## Deployment sequencing for this pass's changes

1. **Merge this PR to `master`** after review.
2. **Sync local `master`** on Matthew's machine (`git fetch && git checkout master && git pull`).
3. **`pac code push`** from synchronized local `master` — deploys Workstreams 1–7's client-side code
   (the plugin build artifacts are NOT deployed by `pac code push`; plugin registration is a
   separate action, see Operator Action Register item 1).
4. Client-side code for Workstreams 5B/6/7 is inert until:
   - Workstream 5: the three schema columns are provisioned (item 3 in the register).
   - Workstream 6: an additive schema for closing documents exists AND the panel is mounted
     somewhere (item 4).
   - Workstream 7: an additive schema for funding authorization exists AND the panel is mounted
     somewhere (item 5).
   Deploying the code with none of these done is SAFE — every new module is either allow-listed as
   unmounted (Workstreams 6/7) or gated behind an unflipped constant (Workstream 4's checklist
   activation, which was already gated before this pass).
5. Register the Dataverse plugin (item 1) — independent of the `pac code push` step; can happen
   before or after.

## Rollback

- **Client-side code (Workstreams 1–4)**: a `git revert` of the merge commit returns to the pre-pass
  state; no schema was touched, so no data migration is needed. `pac code push` the reverted
  `master`.
- **Plugin registration (Workstream 1)**: disable/delete either plugin step via the Plugin
  Registration Tool to return instantly to client-only enforcement — no schema change, no client
  redeploy required (see `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md`).
- **Workstreams 5B/6/7 schema (if later applied)**: every proposed column/table in this pass is
  purely additive (new nullable columns / new tables). Rollback is deleting the unused
  columns/tables via the maker portal — no data-loss risk to existing rows since nothing else
  references them until explicitly wired.
- **Feature flags**: `DOCUMENT_CHECKLIST_GENERATION_ENABLED` and `FUNDING_AUTHORIZATION_ENABLED`
  remain `false` after this pass; no flip to roll back.

## Risk summary

| Item | Risk if deployed as-is (schema/mounting not yet done) |
|---|---|
| Plugin (built, not registered) | None — inert until registered |
| Activity logging unification | Live change — same risk profile as any other client code change; fully tested |
| Residual remediation | Live change — modal hook migration tested for both migrated modals; SYSTEM TEST classification fix is additive (widens exclusion, never narrows it) |
| Checklist exact-count tests | Test-only change; zero runtime risk |
| Schema prep (5A) | Zero risk — no live schema touched, new module unwired |
| Closing-document framework | Zero risk — new module unwired, allow-listed |
| Funding authorization framework | Zero risk — new module unwired, allow-listed |
