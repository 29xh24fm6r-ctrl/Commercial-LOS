# Phase 142F — Integration Adapter Registry for AML, Credit Bureau, Scoring, and Core Banking

> **What this is.** A governed integration **architecture** — provider registry,
> adapter contracts, a disabled adapter factory, a validation gate, a resolver, a
> readiness deriver, and read-only status surfaces — for external banking, credit,
> and servicing systems. EVERY provider is **disabled by default**. This phase
> creates the registry and adapter seams only: **no external integration is
> live.** It makes NO external call, NO fetch, transmits NO PII, pulls NO credit,
> runs NO AML, scores NO credit decision, posts to NO core, writes to NO
> Dataverse, and approves/declines NO credit.

## 1. Purpose

nCino / Salesforce / OpenCBS-style banking platforms are valuable because they
orchestrate many external systems from one workflow: AML/KYC, sanctions, credit
bureau pulls, risk scoring, core banking lookups, e-sign, document collection,
collateral / insurance / title / appraisal / flood / UCC vendors, and
servicing / payment systems. OGB LOS needs that integration architecture now —
but every provider must remain **disabled by default** and gated by policy,
permissions, explicit human action, and future transport configuration.

Core principle: **this phase creates the registry and adapter seams. No external
integration is live.**

## 2. Prerequisites

- **Phases 142A–142E** — convergence layer, platform metadata, workflow routing,
  product/process template registry, and servicing/lifecycle model.
- **Phases 141A–141P** — annual review and CRM stack.
- **Phases 140A–140Q** — portfolio boarding system of record.

## 3. nCino / Salesforce / OpenCBS inspiration

- **External provider orchestration** — one workflow coordinates many systems.
- **AML / KYC and sanctions** — screening providers gated by approval and PII policy.
- **Credit bureau** — permissible-purpose, human-approved report requests.
- **Scoring** — decision support only; never a final credit decision.
- **Core banking** — customer / account / balance / loan lookups (read-only here).
- **Servicing / payment systems** — servicing status, maturity, tickler, and
  payment-history lookups (no posting).

## 4. What this phase adds

| File | Role |
|---|---|
| `integrationAdapterTypes.ts` | Categories, modes, risk, sensitivity, contracts, error codes |
| `integrationProviderRegistry.ts` | 20 disabled provider definitions (one per category) |
| `integrationAdapterContracts.ts` | Generic + per-category adapter interfaces |
| `validateIntegrationRequest.ts` | Fail-closed request validation gate |
| `createDisabledIntegrationAdapters.ts` | Disabled adapter factory (blocks every attempt) |
| `resolveIntegrationAdapter.ts` | Allowlist-only resolver (always disabled this phase) |
| `deriveIntegrationReadiness.ts` | Required / blocked integration readiness deriver |
| `IntegrationAdapterRegistryPanel.tsx` | Read-only registry panel |
| `IntegrationRequestPreviewPanel.tsx` | Read-only, redacted request preview panel |

Every provider declares its risk class, data sensitivity, permission and human
approval requirements, and (where applicable) permissible-purpose requirement.
The validation gate evaluates disabled / write-mode / capability / permission /
approval / permissible-purpose / PII / transport in priority order and **never
returns "ready"** in this phase — a fully configured future adapter still
terminates at `blocked_live_calls_disabled`. The readiness deriver maps an
upstream workflow / template / lifecycle context to the integration categories it
would require, and reports every provider as blocked with "configure / approve"
(never "execute") next best actions.

## 5. What remains disabled

- **All external calls** — no fetch, no transport, no live provider call.
- **PII transmission** — borrower / tax / account / payment data never leaves.
- **Credit pulls** — no bureau report is requested.
- **AML / sanctions runs** — no screening is executed.
- **Scoring decisions** — scoring cannot approve or decline credit.
- **Core writes** — read-only lookups only; no core write capability is enabled.
- **Payment / disbursement** — no payment posting, no disbursement.
- **E-sign send** — preview / status only; no envelope is sent.
- **Upload links** — no upload-link generation.
- **Borrower outreach** — no email / SMS / mailto / Twilio.
- **CRM / Dataverse writes** — none; no route is registered for the panels.

## 6. Future activation requirements

Before any provider could be enabled in a later phase:

1. **Policy approval** — documented institutional approval of the integration.
2. **Vendor due diligence** — third-party risk / vendor review.
3. **DLP / security review** — data-loss-prevention and security sign-off.
4. **Permissible purpose** — for credit bureau (and tax) data.
5. **Human approval** — explicit per-use authorization where required.
6. **Transport adapter** — a configured, reviewed external transport.
7. **Audit logging** — complete, immutable audit of every request.

## 7. Next recommended phase

**Phase 142G — Admin configuration review queue (no schema mutation)** — a
governed, read-only review queue for configuration changes that proposes and
reviews but never mutates schema.
