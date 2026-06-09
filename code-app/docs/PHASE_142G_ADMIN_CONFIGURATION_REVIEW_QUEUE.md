# Phase 142G — Admin Configuration Review Queue (No Schema Mutation)

> **What this is.** A governed admin configuration **review queue** that lets OGB
> LOS model PROPOSED configuration changes — for platform objects/views, workflow
> routes/rules, product/process templates, servicing lifecycle rules, integration
> adapters, and (blocked) schema / custom fields / route registration — **without
> applying them.** This phase is the safe bridge toward a future admin
> configuration experience. It does NOT mutate live configuration, edit templates,
> change workflow routes, enable integrations, add custom fields, change Dataverse
> schema, or write to Dataverse.

## 1. Purpose

Salesforce / nCino / Corteza-style platforms are powerful because admins can
configure objects, views, workflows, products, and integrations. In a regulated
bank LOS, those changes must be **reviewed, audited, risk-classified, and
controlled**. This phase creates the review workflow for proposed configuration
changes — without executing those changes.

Core principle: **admins may review proposed configuration changes, but cannot
apply them in this phase.**

## 2. Prerequisites

- **Phases 142A–142F** — convergence layer, platform metadata, workflow routing,
  product/process templates, servicing/lifecycle model, and integration adapter
  registry.

## 3. Salesforce / Corteza / nCino inspiration

- **Admin customization** — objects, views, fields configured by admins.
- **Workflow configuration** — routes, rules, and approvals.
- **Integration configuration** — provider enablement and transport.
- **Governed review** — every configuration change is reviewed and audited
  before it can take effect.

## 4. What this phase adds

| File | Role |
|---|---|
| `adminConfigurationTypes.ts` | Proposal / status / risk / queue / decision types |
| `adminConfigurationContentSafety.ts` | Unsafe-content scan + type→scope/risk mapping |
| `buildAdminConfigurationProposal.ts` | Proposal builder (metadata only) |
| `validateAdminConfigurationProposal.ts` | Validation gate (validForApply always false) |
| `deriveAdminConfigurationReviewQueue.ts` | Permission-scoped review queue deriver |
| `deriveAdminConfigurationReviewDecision.ts` | Review decision model (never applies) |
| `AdminConfigurationReviewQueuePanel.tsx` | Review-only queue panel |
| `AdminConfigurationSummaryPanel.tsx` | Read-only summary panel |

Proposals are local domain models only. Schema / custom-field / route-registration
proposals are immediately `blocked_unsafe`. Integration and permission proposals
are high-risk and not apply-ready. Unsafe content (executable code, SQL/OData,
secrets, PII/SSN/TIN/account numbers) is detected and redacted, never stored raw.

## 5. What remains disabled

- **Schema mutation** — no Dataverse schema change.
- **Custom fields** — no custom field creation.
- **Route registration** — none; no new route is registered.
- **Workflow mutation** — no route/rule application or execution.
- **Template editing** — no live template change.
- **Integration activation** — no provider enablement, no transport.
- **Permission widening** — no permission change.
- **Live writes** — no Dataverse / CRM write, no fetch, no external call.

## 6. Review-only model

- **`approved_not_applied`** — the strongest positive outcome: approved for a
  future implementation phase, but **not applied**.
- **`blocked_unsafe`** — unsafe proposal types / content are reviewable only as a
  blocked explanation.
- **`validForApply` is always false** — no proposal is apply-ready in this phase.
  There is deliberately no applied / deployed / published / activated / executed
  status.

## 7. Next recommended phase

**Phase 142H — Competitive dashboard and executive product strategy surface** — a
read-only executive view of the competitive convergence backlog and platform
strategy.
