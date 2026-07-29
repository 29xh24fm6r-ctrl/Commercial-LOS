# Durable-record server enforcement evidence — 2026-07-29

Status: **DEPLOYED AND ACTIVE; INDEPENDENT MULTI-USER CERTIFICATION PENDING**

## Deployed boundary

Assembly:

- name: `CommercialLendingLOS.Plugins`
- version: `1.0.0.0`
- assembly ID: `a6801cc8-a28b-f111-ab10-70a8a59b1fe2`
- public key token: `74c842538bd8bf32`
- isolation: Sandbox (`2`)
- source: Database (`0`)
- release DLL SHA-256:
  `7edb89b1bd568e8b018a6cc364b3e1811a6716c8fe1f2a8d89694fb4449459b6`
- solution-managed in `CommercialLendingLOS`: yes, one component record

Plug-in type:

- `CommercialLendingLOS.Plugins.DurableRecordGovernancePlugin`
- type ID: `a8801cc8-a28b-f111-ab10-70a8a59b1fe2`

Registration:

- 7 tables × Create/Update/Delete = 21 steps
- all 21 active
- all 21 synchronous (`mode=0`)
- all 21 PreOperation (`stage=20`)
- 7 Update pre-images
- all 7 use `messagepropertyname=Target`, alias `PreImage`, and the
  manifest-pinned attribute list

Tables:

- `cr664_creditapprovaldecision`
- `cr664_commitmentrecord`
- `cr664_conditionverification`
- `cr664_executeddocattestation`
- `cr664_bookingqccheck`
- `cr664_adverseactionrecord`
- `cr664_fundingauthorization`

## Controls enforced in Dataverse

- initiating `systemuser` must be enabled and have an email;
- exactly one active `cr664_platformuser` must match the normalized email and
  link to an active, same-email `cr664_user`;
- where banker authority is required, exactly one active banker must match and
  link to that same core user;
- client-supplied actor fields must match the initiating Dataverse user;
- credit requester/originator self-approval is rejected;
- approval limit, committee membership, and override configuration are checked
  against the current deal amount;
- commitment issuance requires a durable approved credit decision;
- condition, executed-document, booking-QC, and adverse-action records enforce
  actor/status/deal/supersession rules;
- booking QC cannot be performed by the originating banker;
- adverse action requires the deal's durable declined status;
- six final-arc tables are append-only and all seven tables reject Delete;
- funding starts Pending, preserves immutable request/history fields, and
  rejects illegal transitions;
- the requester cannot approve/reject/revoke/fund;
- requests at or above `$250,000` require two distinct approvers;
- funding confirmation must be by a person distinct from both approvers;
- destination, conditions, unresolved exceptions, funding date, and required
  document state are checked before `FUNDED`;
- reviewed required documents require a real upload-status flag; waived and
  not-applicable requirements do not falsely require an upload.

## Build and automated evidence

- Release target: `net462`
- test host: .NET SDK `8.0.423` in a temporary tool directory
- result: **64 passed, 0 failed**
- existing NU1701/NU1702 warnings remain because the net8 test host references
  the net462 Dataverse assembly; no test failed.
- PowerShell parsers passed for registration, bypass, identity-readiness, and
  role-catalog scripts.
- Focused TypeScript governance contract: **5 passed, 0 failed**.
- TypeScript project compilation: passed.
- Production build: passed with the existing large-chunk and ineffective
  dynamic-import warnings.
- Repository-wide Vitest run: completed in **534.6 seconds** and failed. The
  reported failures include legacy governance contracts that require
  production-enabled CRM, portfolio, checklist, and document flags to remain
  `false`, plus a Phase 242 script-pack test that assumes its directory
  contains only six scripts. Those expectations conflict with the already
  deployed production baseline and were not rewritten to manufacture a green
  run. No failure was reported in the new durable-record enforcement contract.

## Live deployment sequence

1. The initial unsigned registration was rejected by Dataverse with
   `0x8004416c` before assembly creation.
2. The assembly was strong-name signed and rebuilt; all 64 tests passed.
3. Assembly/type registration succeeded.
4. Dataverse create-time step-state behavior and the required pre-image
   `messagepropertyname` were corrected in the idempotent registrar.
5. The complete registration converged to 21 disabled steps and 7 pre-images.
6. Readback proved 21 disabled/0 enabled and 7 valid Target pre-images.
7. The assembly was added to `CommercialLendingLOS` with required components.
8. Matthew's existing identity chain was reconciled with ETag-protected,
   reversible patches:
   - core-user active access: `false` → `true`;
   - banker core link: null →
     `940a202e-756a-f111-ab0c-70a8a59be491`;
   - no role, limit, committee, override, workspace, email, or record state was
     widened.
9. All 21 steps were enabled.
10. Final readback proved 21 active, 0 disabled, all synchronous PreOperation,
    and one solution component.

## Direct-bypass production smoke

Target controlled deal:

- `e262b023-5a8b-f111-ab10-70a8a59b1fe2`
- `SYSTEM TEST - FULL E2E - 2026-07-25 - Working Capital`

Using Matthew's authenticated Dataverse identity, the verifier directly
attempted a spoofed-actor Create through the Web API against each of the seven
tables. Result:

- rejected: **7/7**
- rejection source: active server plug-in
- before/after row counts unchanged: **true**
- persisted smoke rows: **0**
- completion timestamp: `2026-07-29T19:16:53-04:00`

This proves direct Web API requests do not bypass the deployed actor gate. It
does not substitute for positive lifecycle certification by distinct humans.

## Remaining gates

- tenant admin creates/approves the three least-privilege Dataverse security
  roles and provisions four real users;
- each distinct person completes managed-Edge MFA;
- positive/negative credit, funding, confirmation, boarding, and servicing
  paths pass with those identities;
- environment/table auditing and records retention are enabled and certified;
- actual file bytes and finalized memo content pass durable readback;
- production counts and the complete lifecycle reconcile.

The overall Production GO verdict remains **NO-GO** until those gates pass.
