# Production Acceptance Checklist — Commercial-LOS Launch

> A bank's system of record is "launched" only when each live-write domain has **authentic,
> attributable, machine-proven** smoke evidence AND a **named human** has accepted it on the
> live play URL. This checklist is that human pass. It is operator-owned — the repo cannot
> fake any line of it.

## Pre-conditions (machine gate)

- [ ] `npm run verify:launch-evidence` exits **0** (all six domains `accepted` at `HIGH`
      confidence). Until then it exits non-zero and prints exactly which domains are
      insufficient and why — do not proceed past a non-zero result.

The verifier runs the Phase-1 integrity report (`deriveEvidenceIntegrity`) over
`docs/operator-evidence/final-launch/*.json`. A domain is accepted only with: a real
operator UPN (no sentinels), class-appropriate machine proof (CRUD → `affectedRecordIds`;
external send → `deliveryReceiptId` + `approvedRecipient` + `approverUpn`), and a real
machine clock (no round `:SS=00.000` timestamps).

## Sign-off — one block per live-write domain

For each domain: open the live play URL, perform the controlled action against a launch-test
record, and confirm the recorded evidence matches what you observed. Record a **named**
signer and timestamp.

### 1. CRM live persistence (`crmLivePersistence`)
- [ ] Created → read back → updated → read back → cleaned up a launch-test
      `cr664_crmorganizations` row in the app.
- [ ] Evidence `operatorUpn` is your real UPN; `affectedRecordIds` lists the created GUID.
- Signer: `__________________`  ·  UPN: `__________________`  ·  Date/Time (UTC): `__________`

### 2. Portfolio boarding persistence (`portfolioBoarding`)
- [ ] Boarded → read back → cleaned up a launch-test `cr664_portfolioboardedloans` row.
- [ ] Evidence `operatorUpn` real; `affectedRecordIds` lists the created GUID.
- Signer: `__________________`  ·  UPN: `__________________`  ·  Date/Time (UTC): `__________`

### 3. Document checklist generation (`documentChecklist`)
- [ ] Generated a checklist with the live write transport on a launch-test deal; read back; cleaned up.
- [ ] Evidence lists the affected checklist record id(s) — not an empty array.
- Signer: `__________________`  ·  UPN: `__________________`  ·  Date/Time (UTC): `__________`

### 4. Stage advancement (`stageAdvancement`)
- [ ] Advanced a launch-test deal one stage; confirmed audit sink + timeline sink + readback; rolled back.
- [ ] Evidence lists the affected record id(s); `auditVerified` true.
- Signer: `__________________`  ·  UPN: `__________________`  ·  Date/Time (UTC): `__________`

### 5. Borrower communication send (`borrowerSend`) — HIGHEST RISK, LAST
> Only after the Office 365 Outlook connector is registered and the SDK regenerated. Email
> mode is moved `DRY_RUN → HANDOFF → LIVE` deliberately, watching the timeline between stages.
- [ ] Sent to an **approved test recipient** (not a real borrower) from the live LIVE adapter.
- [ ] Captured the transport **delivery receipt id**; recorded the **approved recipient** and
      the **named approver** who authorized the send.
- [ ] Evidence carries `deliveryReceiptId`, `approvedRecipient`, `approverUpn` (all required).
- Approved recipient: `__________________`
- Approver (named): `__________________`  ·  Approver UPN: `__________________`
- Signer: `__________________`  ·  UPN: `__________________`  ·  Date/Time (UTC): `__________`

## Final launch declaration

- [ ] `npm run verify:launch-evidence` exits 0.
- [ ] All five domain blocks above signed; New Deal create already pilot-certified
      (Phase 227/228A).
- [ ] `pac code push` the launch-certified commit.
- [ ] Archive the green `verify:launch-evidence` output + this signed checklist as the durable
      launch record.

Launch declared by: `__________________`  ·  UPN: `__________________`  ·  Date/Time (UTC): `__________`
