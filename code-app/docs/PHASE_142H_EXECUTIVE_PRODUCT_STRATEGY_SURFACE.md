# Phase 142H — Competitive Dashboard and Executive Product Strategy Surface

> **What this is.** A governed, **read-only** executive / product strategy surface
> that turns the Phase 142A-G platform convergence work into product intelligence
> for leadership, product planning, and build prioritization. It shows current vs
> target capabilities, shipped vs planned status, competitive gaps,
> differentiators, the implementation backlog, risk by item, the forward roadmap,
> and the safety posture. It is a **strategic read-only control surface** — product
> intelligence, not operational execution. It creates no product changes, mutates
> no configuration, enables no integrations, alters no routes, approves no credit,
> sends no outreach, calls no external systems, and writes to no Dataverse.

## 1. Purpose

OGB LOS is evolving beyond a traditional LOS into a governed banking operating
system. Leadership needs a clear product strategy surface to understand what has
shipped, what remains planned, where OGB LOS compares to nCino / Salesforce,
where open-source references inform the roadmap, what is intentionally disabled,
and what the next build phases should be.

Core principle: **this dashboard is a strategic read-only control surface. It
provides product intelligence, not operational execution.**

## 2. Prerequisites

- **Phases 142A–142G** — convergence layer, platform metadata, workflow routing,
  product/process templates, servicing/lifecycle model, integration adapter
  registry, and admin configuration review queue.
- **Phases 141A–141P** — annual review stack.
- **Phases 140A–140Q** — portfolio boarding stack.

## 3. What this phase adds

| File | Role |
|---|---|
| `executiveStrategyTypes.ts` | Dashboard state, KPI, gap, differentiator, roadmap, safety types |
| `deriveExecutiveProductStrategyDashboard.ts` | Strategy dashboard deriver (scores from the 142A matrix) |
| `deriveCompetitiveDifferentiators.ts` | Differentiator deriver (shipped vs planned) |
| `deriveCompetitiveGaps.ts` | Gap deriver (intentional, governed gaps) |
| `deriveCompetitiveRoadmap.ts` | Roadmap deriver (Phases 142I-T) |
| `ExecutiveProductStrategyPanel.tsx` | Read-only executive strategy panel |
| `CompetitiveReferencePlatformPanel.tsx` | Read-only reference comparison panel |
| `CompetitiveSafetyPosturePanel.tsx` | Read-only "what is disabled and why" panel |

Scores are strategic metadata derived from the Phase 142A capability matrix and
backlog — current from shipped capabilities only, target adding planned ones.
High-risk capabilities count as governed readiness, not live functionality.
Missing inputs produce caveats, never fake scores.

## 4. Competitive references

- **Salesforce / nCino archetype** — commercial bank CRM + LOS platform baseline.
- **DigiFi / getsan4u LOS** — unified, configurable LOS.
- **OpenCBS LOS** — open-source core banking / LOS routing and committee path.
- **Frappe Lending** — post-origination lifecycle structure.
- **Twenty CRM** — flexible object / view model.
- **Corteza** — low-code platform, integration registry, self-hosting.

All comparisons are from public product / repository documentation only — no
external links, iframe, fetch, or repository scraping; unknowns are caveated and
no competitor claim is made without caveat.

## 5. What OGB LOS now has

Evidence-backed annual review, a CRM relationship master with authorization /
do-not-contact, a portfolio boarded-loan SOR, FDIC / examiner package draft
automation, a package / evidence / caveat model, permission-before-render
workspaces, disabled-by-default integrations, an admin configuration review
queue, no-fake-data governance, and role-based executive / manager / portfolio /
team / banker surfaces.

## 6. What remains intentionally disabled

Final credit approval / decline (forbidden), covenant waiver (forbidden), borrower
outreach (disabled), upload-link generation (disabled), live email / SMS
(disabled), live integrations (disabled), credit bureau pull (disabled), AML / KYC
run (disabled), core banking write (disabled), payment / disbursement / accounting
(forbidden), schema mutation / custom fields (forbidden — operator-script
governed), admin apply (review-only), route registration (disabled), package final
export (disabled), and e-sign send (disabled). Each carries a future-activation
prerequisite.

## 7. Recommended next phase

**Phase 142I — Executive-safe route mounting for competitive / product strategy
surfaces** — mount these read-only surfaces behind permission-before-render with
no operational controls.
