# Phase 195 — V1 Controlled Production Pilot Cutover

## 1. Purpose

This phase is the controlled production pilot cutover for OGB LOS V1. It does not
add new product surface area and does not flip any live gate by itself.

The goal is to prove that the current V1 release candidate can support a named,
authorized pilot banker creating one controlled live New Deal, opening that deal
in the banker workspace, preserving audit evidence, and retaining immediate
rollback.

## 2. Current baseline

- Master is clean after PR #37.
- CRM Phase 193A–J is merged.
- Workflow factory Phase 194–200 is merged.
- Controlled live New Deal create certification Phase 194 is merged.
- CRM / workflow / Phase 194 / release-snapshot sweep passed.
- Production build passed.
- Stale worktrees were removed.

## 3. Scope

Phase 195 is limited to:

- Pilot cutover runbook.
- Operator preflight checklist.
- Live-create smoke checklist.
- Evidence checklist.
- Rollback checklist.
- Final V1.0 go/no-go criteria.
- Governance test pinning the runbook and no-code-change posture.

## 4. Non-goals

This phase does not:

- Add a production code path.
- Change Dataverse schema.
- Add or edit migrations.
- Flip `BANKER_NEW_DEAL_CREATE_ENABLED`.
- Flip `NEW_DEAL_CREATE_ADAPTER_ENABLED`.
- Flip `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`.
- Enable borrower communications.
- Enable checklist generation.
- Enable CRM writes.
- Enable workflow stage/task/checklist writes.
- Add sample, fake, demo, or seeded deal data.

## 5. Required pilot identities

Before enablement, the release operator must record:

- Pilot banker name.
- Pilot banker Entra identity.
- Resolved System User id.
- Resolved LOS User Profile id.
- Authorized workspace entitlement.
- Rollback owner.
- Environment name.
- Dataverse environment id or URL.
- Target solution/app version.
- Approval owner for the controlled pilot.

No actorless create is allowed.

## 6. Operator preflight checklist

- [ ] Confirm branch is merged to master.
- [ ] Confirm `git status --short` is clean.
- [ ] Confirm `git diff --check` is clean.
- [ ] Confirm CRM / workflow / Phase 194 / release-snapshot tests are green.
- [ ] Confirm full or release-equivalent test suite is green.
- [ ] Confirm production build is green.
- [ ] Confirm the target environment is correct.
- [ ] Confirm pilot banker can sign in.
- [ ] Confirm pilot banker has the Banker workspace entitlement.
- [ ] Confirm production references are approved.
- [ ] Confirm Stage/Status resolver is ready.
- [ ] Confirm audit actor resolution maps to `cr664_user`.
- [ ] Confirm rollback owner is present.
- [ ] Confirm no borrower communication will be sent.
- [ ] Confirm checklist generation remains disabled.
- [ ] Confirm CRM writes remain disabled / readiness-only.
- [ ] Confirm workflow write actions remain fail-closed unless separately approved.

## 7. Controlled enablement checklist

Controlled enablement is performed by the release operator using the
already-certified pilot switch documented in Phase 194
(`BANKER_CREATE_PILOT_ENABLED`).

- [ ] Enable only the controlled pilot switch required for New Deal create.
- [ ] Do not flip the three global create constants.
- [ ] Confirm the create surface is visible only for the authorized pilot banker.
- [ ] Confirm non-pilot users remain disabled or unauthorized.
- [ ] Confirm the rollout state is `live_controlled` only for the approved pilot context.

## 8. Live-create smoke checklist

- [ ] Pilot banker opens Banker workspace.
- [ ] Pilot banker opens New Deal create.
- [ ] Required-field validation is confirmed.
- [ ] One controlled live deal is created.
- [ ] Created deal opens in `/deals/:dealId`.
- [ ] Deal has Stage Intake / Status Open, or approved equivalent references.
- [ ] Assigned banker is correct.
- [ ] Client reference is correct when supplied.
- [ ] Amount is correct when supplied.
- [ ] No duplicate deal is created from one submit.
- [ ] No fake/sample/demo data appears.

## 9. Audit evidence checklist

Capture:

- [ ] Build log.
- [ ] Test log.
- [ ] Screenshot of pilot banker workspace before create.
- [ ] Screenshot of New Deal create surface.
- [ ] Screenshot of created deal workspace.
- [ ] Created deal id.
- [ ] Audit event row id.
- [ ] ChangedBy bind to `/cr664_users(<CoreUser>)`.
- [ ] Correlation id.
- [ ] Operator name.
- [ ] Timestamp.
- [ ] Environment name/id.
- [ ] Confirmation that no borrower comms were sent.
- [ ] Confirmation that no checklist generation occurred.
- [ ] Confirmation that no CRM writeback occurred.

## 10. Rollback checklist

Rollback is immediate and non-destructive.

- [ ] Disable the controlled pilot switch (`BANKER_CREATE_PILOT_ENABLED = false`).
- [ ] Confirm New Deal create is no longer live.
- [ ] Confirm existing created deal remains accessible.
- [ ] Confirm no additional writes occur after rollback.
- [ ] Capture rollback timestamp and operator.
- [ ] Record whether rollback was tested or only retained as a ready procedure.

## 11. Stop conditions

Immediately stop and rollback if any of the following occurs:

- Actor cannot be resolved.
- Unauthorized user can create a deal.
- Create works without approved production references.
- Stage/Status resolver is not ready.
- Payload contains fields outside the certified allow-list.
- ChangedBy attempts `/systemusers` instead of `/cr664_users`.
- Borrower communication is sent.
- Checklist generation occurs.
- CRM writeback occurs.
- Duplicate deal is created from one submit.
- Fake/sample/demo data appears.
- Created deal cannot be opened.
- Audit fails and cannot be remediated.

## 12. V1.0 go/no-go criteria

### GO

V1.0 can proceed when:

- Pilot create succeeds.
- Created deal opens.
- Audit evidence is captured.
- No borrower comms occurred.
- No checklist generation occurred.
- No CRM writeback occurred.
- Rollback is confirmed or retained ready.
- All stop conditions remain false.
- Release operator signs off.

### NO-GO

V1.0 must not proceed if any stop condition occurs or if audit evidence is
incomplete.

## 13. Verification commands

```powershell
git status --short
git diff --check
npm --prefix code-app test -- crm workflow phase194 phase195 releaseCandidateSnapshot
npm --prefix code-app run build
```

Build-from-no-`.power` posture is preserved: `pnpm build` (and the npm build
script) run the Phase 190A preflight first
(`node scripts/phase190A-power-artifact-preflight.mjs --ensure && tsc -b && vite
build`), so a fresh clone with no `.power/` builds deterministically.

## 14. No-code-change posture

This phase is **docs + governance test only**. It adds **no production code
path**, **no Dataverse schema**, and **no migration**. The three global create
constants stay `false` and are **not flipped** by this phase:

- `BANKER_NEW_DEAL_CREATE_ENABLED = false`
- `NEW_DEAL_CREATE_ADAPTER_ENABLED = false`
- `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`

`evaluateBankerCreateRollout()` returns `disabled` by default. Controlled
enablement is performed only by the operator via the certified Phase 194 pilot
switch, with one-line rollback. The document-checklist gates remain `false`
(`DOCUMENT_CHECKLIST_PILOT_UI_ENABLED`,
`DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED`,
`DOCUMENT_CHECKLIST_GENERATION_ENABLED`). No borrower communications, no checklist
generation, no CRM writes, and no sample/fake/demo deal data are introduced.

## 15. Final recommendation

**READY FOR CONTROLLED PILOT CUTOVER.** The V1 release candidate supports a named,
authorized pilot banker creating one controlled live New Deal under the certified
gate model, with audit evidence and immediate, non-destructive rollback. V1.0
proceeds on the §12 GO criteria once the release operator captures the evidence
and signs off; any §11 stop condition is an immediate NO-GO / rollback.
