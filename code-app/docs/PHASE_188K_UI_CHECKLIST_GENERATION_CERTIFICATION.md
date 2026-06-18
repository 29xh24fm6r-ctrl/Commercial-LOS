# Phase 188K — UI Checklist Generation Certification & Rollback Controls

**Status:** CERTIFICATION / CONTROL PHASE ONLY. This phase enables nothing. No
production enablement, no live UI generation, no borrower comms, no Dataverse
write from the UI, no New Deal auto-run, no route/schema change.

188J added the controlled, dependency-injected banker-UI → adapter proof seam
(`runDocumentChecklistUiGenerationAction`) and merged it to `master`. **188K
certifies that merged seam and pins the rollback / kill-switch behavior** before
any operator-facing enablement is ever considered (188L or later).

---

## 1. Purpose

To lock down — as enforceable governance tests plus this document — that the
checklist generation UI is, and stays, fail-closed by default. 188K certifies:

1. Default runtime remains fully disabled.
2. Both UI rollback switches fail closed independently.
3. The runtime generation gate fail-closes independently.
4. Missing actor / deal / approved names still block generation.
5. A `/systemusers` actor bind remains rejected.
6. The UI action cannot be reached from a normal panel render.
7. The test-only seam cannot accidentally become production behavior.
8. No borrower communication or document-request flow exists on the UI path.
9. No checklist row payload expansion occurred.
10. The exact rollback procedure is documented (this file).

These are pinned by
`src/shared/governance/phase188KUiChecklistGenerationCertificationContract.test.ts`.

---

## 2. What 188K explicitly does NOT do

- **188K does not enable UI generation.** All three gates stay `false`.
- **188K does not execute a live proof.** No live Dataverse call is made.
- **188K does not create checklist rows.** No row is written anywhere.
- **188K does not contact borrowers.** No email / SMS / Outlook / handoff.

188K is certification-only: governance tests + this doc. No runtime/source
behavior of the seam changes.

---

## 3. Certified default-disabled posture

| Gate | Value | Role |
| --- | --- | --- |
| `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED` | `false` | Panel / preview UI gate. |
| `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED` | `false` | Clickable action gate. |
| `DOCUMENT_CHECKLIST_GENERATION_ENABLED` | `false` | Runtime generation gate. |

The panel's `generateDisabled = true` invariant is preserved; `generateActionEnabled`
defaults to the disabled `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED` flag and
no `onGenerate` callback is wired in runtime. The panel is mounted banker-only and
read-only in `DealDocuments.tsx` (`!readOnly && banker`) with **no** action
wiring. The panel imports no live Dataverse dep, no
`generateAuditedDocumentChecklist`, and no `documentChecklistUiGenerationAction`.

---

## 4. Certified fail-closed bridge behavior

The merged bridge `runDocumentChecklistUiGenerationAction` is a pure,
dependency-injected seam. 188K certifies (behaviorally, in tests) that it refuses
— **without invoking the injected adapter** — when:

- the pilot UI gate is `false` → `refused_gate_disabled`,
- the UI generate-action gate is `false` → `refused_gate_disabled`,
- the actor is missing → `refused_missing_actor`,
- the actor bind is `/systemusers` (or any non-`cr664_users` target) →
  `refused_unsafe_actor_bind`,
- the deal id is missing → `refused_missing_deal_id`,
- the approved names are empty → `refused_missing_approved_names`.

The **runtime generation gate** (`DOCUMENT_CHECKLIST_GENERATION_ENABLED`) is **not**
represented in the bridge's injected gate config; it is enforced fail-closed by the
injected adapter. With it off, the adapter returns `disabled`, which the bridge
maps to a blocked UI state and never refreshes. The read-only refresh stays
injected and runs **only** after a `success` / already-generated outcome.

### Actor identity rule

The audit actor bind must be `/cr664_users(<CoreUser>)` — **never `/systemusers`**.
Enforced by the shared `isCoreUserBind` guard.

### Deal & approved-name rules

The bridge accepts the **exact deal id** only (no fuzzy / name lookup) and
approved names sourced from `DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES` static
config. The injected adapter owns the allow-listed row payload.

---

## 5. Certified row-payload + correlation-id invariants

- `DOCUMENT_CHECKLIST_ALLOWED_FIELDS` is exactly the two row fields:
  `cr664_documentname` and `cr664_Deal@odata.bind`.
- No `cr664_documenttype` usage.
- The correlation id is **audit-only / request metadata** — never a checklist
  row field. No `cr664_correlationid` is written to a row.

---

## 6. Rollback / kill-switch procedure

Each switch fails closed **independently** — setting any one to `false` disables
generation. The certified rollback:

- **Immediate UI rollback:** `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false`.
- **Immediate action rollback:** `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false`.
- **Runtime generation rollback:** `DOCUMENT_CHECKLIST_GENERATION_ENABLED = false`.

(All three are already `false` on `master`; this is the resting, certified state.)

### Expected behavior after rollback

- The panel renders disabled (the generate control is a disabled, non-operative
  button).
- No adapter invocation occurs.
- No row creation occurs.
- No borrower contact occurs.
- Read-only checklist state still visible if already present (the panel keeps
  showing existing / would-create document names as a read-only preview).

### Operator verification commands

```
pnpm test -- documentChecklistPilot documentChecklistUiGenerationAction phase188J phase188K releaseCandidateSnapshot
pnpm build
```

A green run + clean build confirms the gates are false, the panel is disabled,
the bridge fail-closes, and no row/route/comms expansion occurred.

---

## 7. How 188L (or later) would certify enablement

A future enablement phase — **not 188K** — would, only under operator
certification:

1. Re-run the 188J/188K contract + bridge tests and confirm fail-closed preflight.
2. Execute a controlled live proof against a single known deal id with an
   operator-resolved `/cr664_users(<CoreUser>)` actor bind, capturing the audit
   event and the created vs already-present row names.
3. Flip the gates **together**: `DOCUMENT_CHECKLIST_GENERATION_ENABLED`,
   `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED`,
   `DOCUMENT_CHECKLIST_PILOT_UI_ENABLED`.
4. Wire the real injected deps into the panel **at the call site only** (never as
   a static panel import), keeping the bridge the single audited entry point.
5. Record the certification (deal id, correlation id, created/skipped names) and
   keep this rollback switch documented.

Until then, every gate stays `false` and the seam is exercised only by tests.
