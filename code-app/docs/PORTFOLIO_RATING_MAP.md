# Portfolio Rating Map

Status: pending Matt/OGB paper decision.

PE-WIRE-1 wires the boarded portfolio book into the Portfolio Command Center, but OGB has not ratified a canonical mapping from boarded risk-rating strings to the internal 1-8 obligor-grade scale.

Until that mapping is approved, `PORTFOLIO_RATING_MAP` is intentionally empty. Rows with unmapped `riskRating` values are excluded from rating-driven portfolio derivations instead of being coerced into a grade.

Collateral and guarantees may inform the facility band only after an obligor grade is known. They never upgrade or manufacture the obligor grade.
