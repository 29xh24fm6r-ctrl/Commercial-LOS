# FDIC Remediation Platform Blueprint

> **Durable blueprint — not phase-specific.** This document describes the
> target operating model for FDIC remediation across the Commercial Lending
> OS. It outlives any single phase. Phase 140A builds the static foundation;
> later phases (140B–140K and beyond) wire the workspaces. Everything marked
> **future-only** below is a candidate, not a commitment, and nothing here is
> a regulatory completion claim.

## Architecture principle

FDIC remediation is a **governance / evidence layer** spanning the whole
Lending OS — never a single dashboard. Ownership is distributed; Portfolio is
the control tower, not the sole owner.

## Platform modules

| Module | Role | Owns |
| --- | --- | --- |
| Banker / Deal Workspace | Source evidence layer | Repayment source, underwriting quality |
| Credit Administration | Control execution layer | Documents, core-data reconciliation, dual control, appraisal routing |
| Portfolio Command Center | Command center / control tower | Watchlist, classified assets, special mention, concentration |
| Independent Loan Review | Independent challenge layer | Review universe, risk-rating challenge, policy compliance |
| ACL / CECL Workbench | Finance reserve support layer | ACL support, qualitative factors, individual evaluations |
| Appraisal / Evaluation Queue | Collateral compliance layer | Appraisal determination, report tracking, appraisal review |
| Executive / Board | Accountability layer | Commitments, board attention, remediation aging |
| Governance Evidence Ledger | Proof / audit layer | Finding→control→evidence map, artifact index, audit trail |

## Control / evidence flow

```
Banker/Deal ──repayment & underwriting evidence──┐
Credit Admin ──reconciliation, docs, dual control─┤
Appraisal Queue ──appraisal review───────────────┤
                                                  ▼
Independent Loan Review ──challenge──►  Governance Evidence Ledger
                                                  ▲   (indexes all evidence,
Portfolio Control Tower ──watchlist/classified────┤    builds examiner packet)
ACL/CECL Workbench ──reserve support──────────────┤
                                                  │
Executive / Board ◄──rolled-up status & aging─────┘
```

Evidence flows **up** from the source and execution layers, is **challenged**
by Independent Loan Review, is **indexed** by the Governance Evidence Ledger,
and is **reported** to the board. No layer can self-certify; the ledger only indexes evidence — it never concludes the evidence proves the institution is `compliant` or `remediated`.

## Target operating model

1. Source and execution layers capture governed, persisted evidence artifacts.
2. Independent Loan Review challenges ratings and policy compliance.
3. The control tower trends classified assets, special mention, watchlist,
   and concentration from authorized records.
4. The ACL/CECL workbench assembles reserve support.
5. Executive/Board oversight tracks management commitments and aging.
6. The Governance Evidence Ledger indexes the finding-to-control-to-evidence
   trail and assembles the examiner evidence packet.

## Control ownership

Each of the thirteen `FDIC-*-1` controls has exactly one primary workspace
(see `fdicRemediationOperatingModel.ts`). A control is only ever
`wired_with_evidence` when current code truly produces its evidence; today
none are.

## Evidence ownership

Each evidence artifact is produced by exactly one workspace and consumed by
others (see `fdicEvidenceArchitecture.ts`). The minimum-field set is declared
per artifact so a future capture surface knows what "complete" means.

## Future Dataverse entity candidates (FUTURE-ONLY)

These are **candidates only** — Phase 140A adds no schema and no migrations.
None of these tables exist; do not assume any are present.

- `cr664_fdiccontrolstatus` (future-only) — per-loan control status rows.
- `cr664_fdicevidenceartifact` (future-only) — evidence artifact index.
- `cr664_fdicreviewconclusion` (future-only) — independent-review conclusions.
- `cr664_fdicboardcommitment` (future-only) — management commitment tracking.
- `cr664_fdicremediationevent` (future-only) — audit trail of evidence events.

Each, if ever built, would follow the existing `cr664_` publisher prefix and
the platform's governed-write + audit-before-write discipline. **No schema is
created in this blueprint.**

## Reporting packet concept

A board reporting packet rolls up control status, open-item aging, and
concentration trends. It is an oversight **input**, not proof of remediation;
the platform never reports the board as having closed an item.

## Examiner evidence packet concept

The examiner evidence packet is an indexed export of the
finding-to-control-to-evidence trail. The word "examiner" describes the
audience, not a status: assembling a packet does not make the institution
examiner ready, and the platform never asserts that it does. A packet is only
as good as the independently reviewed evidence inside it.

## No fake compliance

This blueprint carries the same discipline as the operating model:

- **Evidence is not automatically compliance**; evidence artifact presence
  does not equal remediation.
- The platform never claims anything is `compliant`, `remediated`, `FDIC approved`, or `examiner ready`.
- The only honest statuses are `mapped_not_wired`, `evidence_gap`,
  `partially_wired`, and `wired_with_evidence`.
- No sample or demo data is presented as regulatory evidence.
