# Phase 142A — Competitive Platform Convergence: Salesforce / nCino / Open-Source Reference Implementation

> **What this is.** A governed, **read-only / metadata-only** competitive
> convergence layer that turns a review of the closest public analogs into
> actionable product architecture for OGB LOS. It changes no runtime behavior,
> adds no framework dependency, enables no writes / outreach / final credit
> decisions / schema mutation.

## 1. Purpose

Absorb the best implementation patterns from the closest public loan-origination
and platform analogs into a capability matrix, reference-architecture map, object/
view/workflow metadata model, product/process templates, a competitive gap
dashboard, and a prioritized, risk-classed implementation backlog — without
replacing the current governed architecture.

## 2. Reviewed reference platforms

- **DigiFi / getsan4u LOS**
- **OpenCBS LOS**
- **Frappe Lending**
- **Twenty CRM**
- **Corteza**

(Salesforce and nCino are included in the capability matrix as the commercial
baseline.)

## 3. What each platform contributes conceptually

- **DigiFi / getsan4u LOS** — unified lending CRM + LOS: underwriting, documents,
  task automation, e-sign, and communications as one configurable workflow surface.
- **OpenCBS** — product/client/channel/amount-based workflow routing and a
  first-class credit committee approval path; AML/bureau/scoring as adapter seams.
- **Frappe Lending** — the post-origination loan lifecycle: products, repayment,
  disbursement, collateral/security, accounting, compliance, and reporting as
  explicit modules.
- **Twenty CRM** — a flexible object model, views, workflows, and code
  extensibility that create Salesforce-like platform power.
- **Corteza** — custom objects, workflow automation, analytics/reporting, REST
  integration, and Docker/self-hosting as platform differentiators.

## 4. Why no repo should replace OGB LOS

No reviewed repo is a complete open-source nCino equivalent for a regulated bank.
The winning strategy combines Twenty/Corteza-style platform extensibility,
DigiFi/OpenCBS-style LOS workflow, and Frappe Lending-style lifecycle/servicing
with **OGB LOS's existing regulated-bank governance, CRM, annual review,
evidence, and FDIC package architecture** — none of which the public repos match.

## 5. OGB LOS current differentiators

- Dataverse-native **governed schema** (operator-script governed, no UI mutation)
- **Workspace security** and permission-before-render
- **CRM Relationship Master**
- **Annual review workflow** (request → spread → covenants → memo/board/FDIC)
- **Financial spreading + covenant testing** (evidence-backed)
- **Memo / board / FDIC package automation** (draft-only)
- **Portfolio boarded-loan system of record**
- **Evidence-backed governance** (audit, redaction, fail-closed)

## 6. Capability matrix summary

30 capability categories scored across 9 platforms. Scores are conservative —
`unknown` (low confidence) is used wherever public evidence is insufficient, and
OGB-current reflects only shipped phases (communications/outreach is preview-only
and disabled; credit routing produces findings, not final approvals).

## 7. Convergence architecture

- **Governed object model** (`platformObjectRegistry`) — Salesforce/Twenty-style
  objects aligned to the cr664 schema, read-only, writes never enabled.
- **Governed view registry** (`platformViewRegistry`) — static views with
  structured (non-string) filters; no user-created views.
- **Workflow routing engine** (`deriveWorkflowRoute`) — OpenCBS/nCino-style
  routing; read-only; no route approves credit; missing data → `review_required`.
- **Product/process templates** (`productProcessRegistry`) — DigiFi/OpenCBS/Frappe
  configurability as template-marked profiles; delivery stays disabled.
- **Competitive dashboard** (`CompetitiveCapabilityDashboard`) — strategy/read-only.

## 8. Recommended implementation backlog

- **142B** — Governed platform object/view metadata surfaces (`metadata_only`)
- **142C** — Configurable workflow routing + credit committee route (`credit_decision_support`)
- **142D** — Product/process template registry (`metadata_only`)
- **142E** — Servicing/lifecycle model (`runtime_write_disabled`)
- **142F** — Integration adapter registry, disabled by default (`external_integration_disabled`)
- **142G** — Admin configuration review queue, no schema mutation (`metadata_only`)
- **142H** — Competitive dashboard + executive product strategy surface (`runtime_read`)

## 9. Safety constraints

No external repo / runtime package dependency; no external calls; no writes; no
borrower outreach; **no final credit approval / decline recommendation**; **no
automatic covenant waiver**; no dynamic schema mutation / user-created custom
fields (Dataverse schema stays operator-script governed); no route registration;
no fake data. All future external integrations and admin mutation are disabled /
review-gated by default.

## 10. Next phase

**Phase 142B — Governed platform object/view metadata surfaces.**
