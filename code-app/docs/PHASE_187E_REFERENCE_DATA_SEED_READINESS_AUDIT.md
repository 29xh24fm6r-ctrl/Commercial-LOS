# Phase 187E — Reference Data & Seed Readiness Audit

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Mode:** READ-ONLY. Live reference-row reads (`--inspect-new-deal-create-references`,
  `--inspect-stage-status-values`, identity captures) + metadata (187B).
- **Captures:** `.phase122/187-captures/inspect-new-deal-create-references.txt`,
  `inspect-stage-status-values.txt`, `inspect-identity-audit-graph.txt`,
  `inspect-coreuser-create-deps.txt`.
- **Spec:** Phase 187E.

## Classification key

- **PROD-SAFE** — active, production-named, safe to reference.
- **TEST/REJECT** — TEST/PHASE/demo/sample row; must not be referenced; should be deactivated.
- **SEEDABLE** — can be safely created by an allow-listed script (dry-run → commit).
- **OPERATOR** — requires Maker Portal operator action (no safe script path, or policy decision).

---

## Reference inventory

### Deal Stage references — `cr664_dealstagereferences`
| code | name | state | classification |
|---|---|---|---|
| INTAKE | Intake | ACTIVE | **PROD-SAFE** (matches in-app production selection) |
| PHASE121_STAGE | TEST - Stage Phase 121 | ACTIVE | **TEST/REJECT** — active TEST row in production table |

- Rows: 2; production-safe active: **1** (INTAKE). Required-for-create on this table:
  `cr664_activeflag`, `cr664_code`, `cr664_name`.
- **E-1 finding:** the `PHASE121_STAGE` TEST row is **active** in the production reference table. It is
  correctly REJECTED by the classifier, but it should be deactivated (operator or guarded script) to
  prevent accidental selection. Not a create blocker.

### Deal Status references — `cr664_dealstatusreferences`
| code | name | state | classification |
|---|---|---|---|
| OPEN | Open | ACTIVE | **PROD-SAFE** (matches in-app production selection) |
| PHASE121_STATUS | TEST — Status Phase 121 | ACTIVE | **TEST/REJECT** — active TEST row |

- Rows: 2; production-safe active: **1** (OPEN). Same shape as stage references.
- **E-2 finding:** `PHASE121_STATUS` TEST row active — same disposition as E-1.

> Net: New Deal create has exactly **one** production-safe active Stage (INTAKE/Intake) and Status
> (OPEN/Open). This matches the in-app production resolver. Stage/Status are **READY** for create;
> the only cleanup is deactivating the two TEST rows.

### User Roles — `cr664_userroles`
| name | id | classification |
|---|---|---|
| System Super Admin | 5595e063-8d55-4068-95b8-ac2a979c2ae9 | **TEST/REJECT** for banker actor (REJECTED_ADMIN_ONLY) |

- **E-3 finding (BLOCKS audit graph):** there is **no production-safe banker role row**. Required-for-
  create is trivial (`cr664_rolename` only), so a banker role is **SEEDABLE** via a guarded script.
  Needed to populate `cr664_user.cr664_role`. See 187D D-3.

### Workspace Types — `cr664_workspacetypes`
- The PlatformUser references one (`13433690-3b7f-4eb1-ac56-37e18fdaa86e`), but the candidate
  classifier surfaces **0 approved PrimaryWorkspace candidates** (187D D-4).
- Creating a new workspacetype requires the **`cr664_workspacecontext` Picklist** (App-required).
- **E-4 finding (BLOCKS audit graph):** either approve/reuse the existing workspacetype row the
  PlatformUser already points at, or seed a production-safe one **with the workspacecontext picklist
  set** (788190001 OPERATIONAL_CONTEXT is the likely banker value; confirm with operator). SEEDABLE
  once the provisioner allow-list includes the picklist; otherwise OPERATOR. See 187D D-2/D-4.

### Workspace Contexts — `cr664_workspacecontext` (PICKLIST on `cr664_workspacetype`)
| value | label | classification |
|---|---|---|
| 788190000 | EXECUTIVE_CONTEXT | PROD-SAFE (fixed option) |
| 788190001 | OPERATIONAL_CONTEXT | PROD-SAFE (fixed option) |
| 788190002 | ADMIN_CONTEXT | PROD-SAFE (fixed option) |

- **Not a reference table** — a fixed OptionSet. No row seeding; the value is set on workspacetype
  create. See 187B B-3 / 187D D-2.

### Audit OptionSets — `cr664_auditevent` (fixed choices, live-verified)
- `cr664_entitytype`, `cr664_eventcategory`, `cr664_eventtype`, `cr664_outcomestatus` — all present and
  **match the generated SDK enums** (187C). **PROD-SAFE; no seeding required.**

### Product / Loan-Structure / Pricing references — `cr664_loandeal` OPTIONAL lookups
- `cr664_ProductTypeReference`, `cr664_LoanStructureTypeReference`, `cr664_PricingTypeReference` are
  **optional** on Loan Deal create (not required-for-create per 187B). The script has a guarded
  `--seed-product-references` mode.
- **E-5 finding:** not blockers for New Deal create. Their live rows were **not** enumerated in this
  pass (out of the required-for-create critical path). **OPERATOR/live pass required** to confirm
  production-safe rows before any workflow that depends on them is enabled (annual review, portfolio,
  pricing). Marked deferred.

### Task templates / Document checklist templates / Borrower invite templates / CRM automation references
- No dedicated reference tables found on the required-for-create path; tasks/documents are created
  ad hoc by banker actions (187A) with only `cr664_taskname` / `cr664_documentname` required.
- **E-6 finding:** template-driven generation (`newDealChecklistGenerationAdapter`) is DISABLED/DEAD
  (187A) and references no live template table at runtime. **Deferred** — confirm template seeding only
  if/when checklist generation is enabled.

---

## Seed-readiness summary

| reference | prod-safe rows | blocker? | disposition |
|---|---|---|---|
| Deal Stage (INTAKE) | 1 | no | READY; deactivate TEST row (E-1) |
| Deal Status (OPEN) | 1 | no | READY; deactivate TEST row (E-2) |
| User Role (banker) | 0 | **yes (audit graph)** | SEEDABLE — seed production-safe banker role (E-3 / D-3) |
| Workspace Type (banker) | 0 approved | **yes (audit graph)** | reuse existing or SEED with workspacecontext picklist (E-4 / D-2/D-4) |
| Workspace Context | n/a (picklist) | no | fixed option; set on workspacetype create |
| Audit OptionSets | n/a (fixed) | no | READY |
| Product/Structure/Pricing | unknown | no (optional) | deferred live pass (E-5) |
| Task/Doc/Borrower/CRM templates | n/a | no | deferred; generation disabled (E-6) |

## Carried forward to 187G

- **TEST-row pollution** (E-1, E-2): `PHASE121_STAGE` / `PHASE121_STATUS` active in production tables —
  WARNING severity, deactivate.
- **Role + Workspace seed** (E-3, E-4): required to unblock the CoreUser bridge (D-1). BLOCKS_AUDIT.
- **Deferred reference confirmation** (E-5, E-6): not V1-create blockers; confirm before enabling
  dependent downstream workflows.
