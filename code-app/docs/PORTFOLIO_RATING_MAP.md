# Portfolio Rating Map

Status: **default convention adopted (Phase 264, P0)** — pending Matt/OGB ratification of a bank-specific scale, if one is ever supplied.

PE-WIRE-1 wires the boarded portfolio book into the Portfolio Command Center. OGB has not ratified a proprietary mapping from boarded risk-rating strings to the internal 1-8 obligor-grade scale, so `PORTFOLIO_RATING_MAP` (in `code-app/src/portfolio/data/boardedLoanAdapters.ts`) defaults to the codebase's own existing `OBLIGOR_SCALE` (`dualRiskRating.ts` — already the canonical source for regulatory classification: Minimal risk / Modest risk / Average risk / Acceptable risk / Special Mention / Substandard / Doubtful / Loss, grades 1-8).

Only **unambiguous** forms are mapped:

- An exact grade digit: `"1"`–`"8"` (and zero-padded `"01"`–`"08"`).
- An exact `OBLIGOR_SCALE` label, case-insensitive: `"Minimal risk"`, `"Modest risk"`, `"Average risk"`, `"Acceptable risk"`, `"Special Mention (Watch)"`, `"Substandard"`, `"Doubtful"`, `"Loss"` (plus a few short synonyms — see the map for the full list).
- A regulatory-classification term that corresponds to **exactly one** grade in this scale: `"Special Mention"` → 5, `"Substandard"` → 6, `"Doubtful"` → 7, `"Loss"` → 8.

A bare `"Pass"` is deliberately **not** mapped: in this scale Pass spans grades 1-4, so collapsing it to a single grade would fabricate precision the boarded data doesn't actually carry. Any `riskRating` value that isn't one of the forms above (a bank-specific code, an unrecognized label, etc.) is excluded from rating-driven portfolio derivations rather than coerced into a grade — this fail-closed behavior is unchanged and test-pinned.

If a bank later supplies its own ratified scale (a genuine "Matt/OGB paper decision"), replace the entries in `PORTFOLIO_RATING_MAP` with that scale's real mapping; the default above is a reasonable starting convention, not a permanent business decision.

Collateral and guarantees may inform the facility band only after an obligor grade is known. They never upgrade or manufacture the obligor grade.
