# Phase 196 — V1 Pilot Enablement Evidence Certification

## 1. Purpose

Phase 196 certifies the **evidence** required to accept the Phase 195 controlled
pilot cutover as V1.0-ready. It is the final evidence gate before the V1.0
GO / NO-GO decision.

- It is **not the live pilot itself** — it does not execute the cutover.
- It is **not a feature build** — it adds no product behavior, no schema, no
  migration, and flips no gate.
- It is **evidence-certification only** — it defines and pins the evidence
  package, redaction rules, safety invariants, and final GO / NO-GO criteria for
  accepting the controlled live pilot.

## 2. Baseline

- Phase 193A–J CRM stack merged.
- Phase 194–200 workflow factory merged.
- Phase 194 controlled live New Deal create enablement certification merged.
- Phase 195 controlled production pilot cutover runbook merged.
- Phase 195 + release-snapshot tests passed.
- Production build passed.
- Master was clean before Phase 196.

## 3. Evidence storage and redaction policy

**Real evidence is stored OUTSIDE the repository** — in the approved evidence
vault or release record. The repository may contain **only redacted placeholders
and checklist requirements**.

The following must **never** be committed to the repository:

- real GUIDs
- full environment URLs
- secrets
- access tokens
- customer names
- borrower names
- personal information (PII)
- screenshots containing live customer data
- local user paths

Use redacted placeholders in the repo and in any in-repo evidence index, such as:

- `<pilot-banker-recorded-outside-repo>`
- `<system-user-id-redacted>`
- `<los-user-profile-id-redacted>`
- `<created-deal-id-redacted>`
- `<audit-event-id-redacted>`
- `<environment-id-redacted>`
- `<correlation-id-redacted>`

## 4. Required pilot identity evidence

The external (outside-repo) evidence package must record:

- Pilot banker name — stored outside repo (`<pilot-banker-recorded-outside-repo>`).
- Pilot banker Entra identity — stored outside repo.
- Resolved System User id — redacted in repo (`<system-user-id-redacted>`).
- Resolved LOS User Profile id — redacted in repo (`<los-user-profile-id-redacted>`).
- Banker workspace entitlement.
- Operator name.
- Rollback owner.
- Environment name / id — redacted in repo (`<environment-id-redacted>`).
- Approval owner.

No actorless create is acceptable — the actor identity evidence is mandatory.

## 5. Controlled pilot switch evidence

The evidence must show:

- The certified Phase 194 / 195 pilot switch (`BANKER_CREATE_PILOT_ENABLED`) was
  the only enablement used.
- The three global create gates were **not** flipped:
  - `BANKER_NEW_DEAL_CREATE_ENABLED` remains `false`.
  - `NEW_DEAL_CREATE_ADAPTER_ENABLED` remains `false`.
  - `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` remains `false`.
- Checklist gates remain `false`
  (`DOCUMENT_CHECKLIST_PILOT_UI_ENABLED`,
  `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED`,
  `DOCUMENT_CHECKLIST_GENERATION_ENABLED`).
- Enablement was limited to the approved pilot context (rollout state
  `live_controlled` only for the approved pilot banker/context).
- Rollback was available before the live create.

## 6. Live New Deal create evidence

The evidence must show:

- The pilot banker opened the Banker workspace.
- The pilot banker opened New Deal create.
- Required-field validation was observed.
- **One** controlled live New Deal was created.
- The created deal opened successfully in `/deals/:dealId`.
- Stage / Status references were approved and correct (Intake / Open, or approved
  equivalent).
- The assigned banker was correct.
- Client reference and amount were correct when supplied.
- **No duplicate deal** was created from one submit.
- **No fake / sample / demo data** appeared.

## 7. Audit evidence

The evidence must show:

- The audit event row was captured (`<audit-event-id-redacted>`).
- The ChangedBy bind used `/cr664_users(<CoreUser>)`.
- `/systemusers` was **not** used for the ChangedBy bind.
- The correlation id was captured and stored outside repo
  (`<correlation-id-redacted>`).
- Operator / timestamp / environment evidence was captured (redacted in repo).
- If the audit **partially failed** (`audit_failed_partial`), the result is **not
  a clean GO** until the audit is remediated.

## 8. Negative evidence / safety confirmation

The evidence must confirm:

- **No borrower communication** was sent.
- **No checklist generation** occurred.
- **No CRM writeback** occurred.
- **No workflow write action** occurred unless separately approved.
- **No unauthorized user** could create a deal.
- **No payload fields outside the certified allow-list** were written.

## 9. Rollback evidence

The evidence must show:

- The rollback switch (`BANKER_CREATE_PILOT_ENABLED = false`) was confirmed.
- Rollback was tested, or formally retained as a ready procedure.
- After rollback, New Deal create was no longer live for the pilot context unless
  deliberately re-enabled.
- The existing created deal remained accessible.
- No additional writes occurred after rollback.
- The rollback operator and timestamp were captured outside repo.

## 10. Stop conditions

Any of the following is an **immediate NO-GO**:

- Actor cannot be resolved.
- Unauthorized user can create a deal.
- Create works without approved production references.
- Stage / Status resolver is not ready.
- Payload contains fields outside the certified allow-list.
- ChangedBy uses or attempts `/systemusers`.
- Borrower communication is sent.
- Checklist generation occurs.
- CRM writeback occurs.
- Duplicate deal is created from one submit.
- Fake / sample / demo data appears.
- Created deal cannot be opened.
- Audit evidence is missing or unreconciled.
- Evidence contains unredacted secrets, URLs, GUIDs, customer names, borrower
  names, or PII.

## 11. Final V1.0 GO criteria

V1.0 is **GO** only if **all** of:

- The Phase 195 pilot was executed.
- One controlled live New Deal create succeeded.
- The created deal opened successfully.
- Audit evidence is complete.
- ChangedBy is `/cr664_users(<CoreUser>)`.
- No borrower comms occurred.
- No checklist generation occurred.
- No CRM writeback occurred.
- Rollback evidence is complete.
- No stop condition occurred.
- The release operator signed off.
- The evidence package is stored outside repo.

## 12. Final V1.0 NO-GO criteria

V1.0 is **NO-GO** if **any** of:

- Any stop condition occurs.
- Evidence is incomplete.
- Audit cannot be confirmed.
- Rollback cannot be confirmed.
- Unauthorized create is possible.
- Any unredacted sensitive production evidence is committed to the repository.

## 13. Verification commands

```bash
git status --short
git diff --check
npm --prefix code-app test -- phase196V1PilotEnablementEvidenceCertification releaseCandidateSnapshot
npm --prefix code-app run build
```

The Phase 190A build preflight remains wired into the build, so `npm run build`
(and `pnpm build`) succeed from a fresh clone with no `.power/`.

## 14. Posture statement

This phase is **docs + governance tests only**. It makes:

- **no production code change**
- **no schema change**
- **no migration**
- **no Dataverse write**
- **no CRM write**
- **no borrower communication**
- **no checklist generation**
- **no workflow write enablement**
- **no feature-flag flip** (it flips no gate)

No real secrets, GUIDs, URLs, user paths, customer names, borrower names,
screenshots, or PII are committed.
