# Phase 142D — Product / Process Template Registry for Commercial Loan Workflows

> **What this is.** A governed, **metadata-only / read-only** product/process
> template registry for commercial loan workflows. Templates model loan products,
> annual-review types, document/covenant/evidence requirements, routing defaults,
> approval checkpoints, package requirements, and servicing/annual-review
> expectations — Salesforce/nCino/OpenCBS-style. They **guide** workflow and
> readiness; they never create live products, approve deals, mutate stages, or
> override policy.

## 1. Purpose

nCino/OpenCBS-style systems route work based on product, process, amount,
customer, channel, evidence, covenant, and approval needs. OGB LOS now has a
governed template layer that says what a product/process is, what documents are
required, what covenants may apply, what evidence is required, what workflow route
should be suggested, what package requirements apply, what approval checkpoints
may apply, and what servicing/annual-review obligations follow.

Core principle: **templates guide workflow and readiness.** They do not create
live products, approve deals, mutate stages, or override policy.

## 2. Prerequisites

- **Phase 142A** — competitive convergence layer (route + product/process
  registries).
- **Phase 142B** — governed platform object/view metadata surfaces.
- **Phase 142C** — configurable workflow routing + credit committee deriver.

## 3. nCino / OpenCBS / Frappe inspiration

- **Product/process templates** — a configurable model of products and processes.
- **Routing defaults** — each template suggests a workflow route.
- **Requirement templates** — document/covenant/evidence requirements per product.
- **Servicing expectations** — post-origination obligations (Frappe Lending).

## 4. What this phase adds

| File | Role |
|---|---|
| `productProcessTemplateTypes.ts` | Template + requirement + result types |
| `productProcessTemplateRegistry.ts` | 10 static governed templates |
| `deriveProductProcessTemplateSelection.ts` | Primary + companion template selection |
| `deriveProductProcessRequirements.ts` | Requirement merge (live outranks template) |
| `deriveProductProcessTemplateReadiness.ts` | Template readiness status |
| `ProductProcessTemplateCatalogPanel.tsx` | Read-only template catalog panel |
| `ProductProcessTemplateSelectionPanel.tsx` | Read-only selection panel |

Selection prefers an exact product/loan-structure match, prefers annual-review
templates when an annual review is present, routes covenant failures to the
covenant-exception template, and adds FDIC / credit-committee **companion**
templates when those routes are required. Missing product/loan-structure yields
`review_required` with candidate templates. The requirement merge dedupes across
templates, preserves source template keys, and lets **live / evidence-derived
requirements outrank generic templates**.

## 5. What remains disabled

- **Live product creation** — none; every template is a static governed template.
- **Template editing** — no create/edit/delete/activate; no user-created templates.
- **Custom fields / schema mutation** — none.
- **Task creation / workflow mutation** — none; selection alters no deal or route.
- **Credit approval / decline** — none.
- **Covenant waiver** — none; covenant exceptions are findings.
- **Writes / fetch** — no CRM or Dataverse writes; no route registered for the
  panels.

## 6. Next recommended phase

**Phase 142E — Servicing/lifecycle model inspired by Frappe Lending.**
