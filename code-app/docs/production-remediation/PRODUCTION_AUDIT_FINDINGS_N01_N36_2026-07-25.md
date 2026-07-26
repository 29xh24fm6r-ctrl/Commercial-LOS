# Production Audit Findings, N-01 through N-36+ (reconstructed 2026-07-26)

## Provenance — read this before using this document

**No single, original "July 25 audit" document exists anywhere in this repository, on any
branch.** This was independently confirmed by a dedicated repo-wide investigation during this
session (searched `master`, `origin/master`, and every `phase*`/`origin/phase*` branch for a
finding list enumerating N-01 through N-36+; none was found).

Every finding description below is **reconstructed from the "Problem statement" / "Investigation"
sections of the ten merged remediation PRs (#132–#141)** that reference it, cross-checked against
the actual code each PR changed. Where a PR's own text is the only surviving record of a finding,
that is stated. This document is the closest a reconstruction can get to the original audit; it is
**not a verbatim reproduction** of it, because that reproduction does not exist to check against.

Finding codes referenced nowhere in this repository's history (`N-04, N-05, N-06, N-12, N-13,
N-27` through `N-32`, `D-02`, `D-03`) are listed at the bottom as **unaccounted for** — not
described as "fixed" or "not fixed," because there is no record of what they even claimed.
Presenting a description for them would be fabrication.

## N-series findings (defects)

| Code | Description (reconstructed) | Source PR(s) |
|------|------------------------------|---------------|
| N-01 | `cr664_requirementstatus` (and sibling document-requirement lifecycle columns) were coded against by two independent write paths but never provisioned on the live Dataverse table. | #132 |
| N-02 | The same "active deal" concept disagreed across surfaces (Dashboard/Manager/Team showing one count, Active Deals/Loan Workflow showing another). | #133 |
| N-03 | Manager/Team Workspace's four child-record loaders per role (tasks/documents/memos/memo-sections) lacked the same Owning-Team-OR-assigned-banker fallback the deal-list loader itself already had, so a team-less new deal's own task never appeared even once the deal did. | #133 |
| N-07 | The saved credit memo omitted every durable underwriting fact a decision-grade memo needs: Global Cash Flow/DSCR, risk rating, underwriting recommendation, repayment analysis. | #135 |
| N-08 | A saved credit memo was only ever visible up to ~200–240 characters, and the memo/section "consistency review" feature produced false contradictions against text that was actually present in the full (untruncated) record. | #135 |
| N-09 | Credit-memo section rows were reported to duplicate content across sections. Investigated and **not reproducible as literally stated** (each section already regenerated from only its own key); the real, smaller issue was boilerplate header/footer repetition and non-canonical (alphabetical, not banker-facing) section ordering. | #135 |
| N-10 | (Reported alongside N-01/N-16/N-21 in the same investigation scope.) Investigated and **confirmed already correct** — the deal-advancement blocker model's per-document `reviewLevel` already guards this; no code change made. | #132 |
| N-11 | Document taxonomy: at least three (investigation found four) independently-authored document-name vocabularies exist, with zero shared stable document-type key, and the same name-normalization rule copy-pasted four times across the codebase — causing at least one real document ("Business Tax Returns" vs. "Tax returns") to reconcile under one taxonomy's algorithm and not another's. | #134 |
| N-14 | A risk rating could be saved at `assigned`/final status with a completely blank rationale, and the UI still claimed the record satisfied the Underwriting exit gate. | #136 |
| N-15 | Risk rating and underwriting recommendation were explicitly stated as "tracked later" — not enforced as real, tracked workflow requirements at all; a stage advance could never actually be blocked on them. | #136 |
| N-16 | Nothing durably recorded *who* received a document, so nothing stopped the same banker from receiving and then reviewing the same document (segregation-of-duties gap). | #132 |
| N-17 | Test/production deal classification relied solely on deal-name-substring matching, with no governed, explicit classification field an admin could set independently of the name. | #141 |
| N-18 | The Documents metric tile showed an "outstanding" count under the bare label "Documents" — a `0` read as "no documents" even when a subtitle on the same tile revealed received-but-unreviewed documents existed. | #133 |
| N-19 | Loan Workflow's own "My Active Deals" tile count could disagree with the table directly beneath it on the same page (tile silently excluded test-classified rows from its count; table included them by design, undisclosed). | #133 |
| N-20 | The Due Diligence page ran its own independent deal fetch that excluded test-classified deals by default, inconsistent with the "findable-list surface" reasoning applied to sibling surfaces (Active Deals, Loan Workflow) — a controlled test deal's real unreviewed documents could read "0 pending review." | #133 |
| N-21 | Every document-requirement write failure surfaced raw OData/.NET transport errors directly to bankers instead of a business-safe message. | #132 |
| N-22 | A CRM company's exact NAICS classification (e.g. NAICS 722511, a restaurant) never durably reached the deal — computed then discarded; the banker had to enter Industry manually and the credit memo showed "Other." | #137 |
| N-23 | The deal's Industry field is a fixed six-value choice list that cannot represent every real CRM industry (the same restaurant/722511 example), so a deal in an unmapped sector had no durable classification at all, coarse or exact. | #137 |
| N-24 | Dataverse DateOnly fields (`targetCloseDate` and others) were parsed as raw UTC instants and rendered/compared with local-timezone math, rolling the displayed calendar day back by one for any viewer west of UTC, and corrupting related day-count arithmetic (closing-soon/overdue signal firing). | #139 |
| N-25 | Loan purpose, loan term, and ownership structure were absent from the New Deal creation wizard and the credit memo, despite being persistable via Deal Profile editing. | #138 |
| N-26 | New Deal wizard viewport behavior — reported as the wizard not visibly entering the viewport / Active Deals possibly being hijacked by the create form. Investigated and **confirmed already correct** (scroll-into-view + auto-focus + auto-expand already implemented, Active Deals renders the Kanban board unconditionally above the collapsed wizard). No code change. | #140 |
| N-33 | Nothing re-scanned existing CRM organizations for duplicates after creation (e.g. "OmniCare 365" created twice, plus "Omnicare 365" as a near-duplicate) — never flagged. | #133 |
| N-34 | Missing-field badges reported as not clearing immediately on valid entry. Investigated and **confirmed already correct** (validation recomputed inline on every render, no blur-gating). No code change. | #140 |
| N-35 | Mouse-driven native `<select>` choices reported as not committing reliably. Investigated and **confirmed already correct** (plain controlled value/onChange pairs, verified with a real `user.selectOptions` test). No code change. | #140 |
| N-36 | Deal-create success and unconfirmed-readback messaging could contradict itself: the success banner asserted "it now appears in your Active Deals" the instant a create succeeded, while the parent shell's own confirm-then-navigate readback could independently render "could not yet be confirmed" for the same deal id, in the same tab. | #140 |

## D-series findings/decisions

| Code | Description (reconstructed) | Source PR(s) |
|------|------------------------------|---------------|
| D-01 | A **deliberate, previously-reviewed design decision** (not a defect): Dashboard/Manager/Team KPI-tile surfaces exclude classified test/smoke deals by default; Active Deals/Loan Workflow/Due Diligence findable-list surfaces include them so a controlled test record stays reachable. N-02's investigation found this split fully explains most of the "count disagreement" pattern; its only real defect contribution was the *undisclosed* nature of the split (fixed as N-19). | #133 |
| D-04 | Objective, not a defect: "eliminate one-day date drift" across all date-only-field surfaces — the umbrella objective N-24's fix satisfies. | #139 |

## Unaccounted-for codes

The following codes are referenced **nowhere** in this repository's history — not in any commit
message, PR body, or doc, on any branch (`master`, `origin/master`, or any `phase*`/`origin/phase*`
branch): **N-04, N-05, N-06, N-12, N-13, N-27, N-28, N-29, N-30, N-31, N-32, D-02, D-03**.

This does not mean they were fixed, and it does not mean they were never real — it means **no
record survives in this repository of what they claimed**. Treating them as "fixed" or "not fixed"
would both be fabrications. If further remediation work is wanted for these codes, the original
finding text needs to be recovered from outside this repository (a prior session's transcript, an
external tracker, or a fresh audit) before any code change can honestly claim to address them.
