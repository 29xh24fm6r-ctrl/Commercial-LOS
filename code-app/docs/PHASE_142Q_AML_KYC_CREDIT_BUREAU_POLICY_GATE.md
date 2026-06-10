# Phase 142Q — AML/KYC and Credit Bureau Policy Gate (No Live Pull)

> **What this is.** A NO-LIVE-PULL policy / readiness gate that must be satisfied
> before any FUTURE AML/KYC, OFAC/sanctions, fraud/identity, or credit bureau pull
> could occur. It calls NO provider, pulls NO report, retrieves NO score/bureau
> data, stores NO credential, makes NO eligibility/AML/KYC/OFAC/identity decision,
> and mutates NO deal/customer state. Every outcome keeps `livePullPerformed`,
> every `*ProviderCalled`, `reportRetrieved`, `scoreRetrieved`,
> `externalSystemChanged`, and `allowedForLivePullNow` false. **This is a policy
> gate only — no live AML/KYC or credit bureau integration.**

## 1. What was added

| File | Role |
|---|---|
| `src/integrations/policyGates/amlKycCreditBureauPolicyGate.ts` | Pure policy-gate types + `evaluateAmlKycCreditBureauPolicyGate`, deterministic gate proof id |
| `src/integrations/policyGates/AmlKycCreditBureauPolicyGatePanel.tsx` | Read-only "no live pull" policy gate panel |

The panel is exported and tested but **not mounted to any route** in this phase —
mounting is deferred so no access is widened and no new loader is added.

## 2. Why it is no-live-pull

AML/KYC, OFAC, fraud/identity, and credit bureau pulls are high-risk external data
operations under FCRA / ECOA / GLBA and OFAC obligations. The bank-safe posture
forbids any live pull until approved providers, a permissible-purpose model,
borrower consent capture, audit logging, and security review exist. This phase
proves only the **policy / readiness boundary** so a future, governed integration
can be designed against a known contract — with zero live risk today.

## 3. Policy domains

`aml_kyc`, `ofac_sanctions`, `fraud_identity`, `credit_bureau`, and
`disabled_placeholder`. The live pull mode is always `disabled_by_default`.

## 4. Input / result shape

**Input** (`AmlKycCreditBureauPolicyGateInput`): `dealId`, `dealName`,
`clientName`, `borrowerLabel`, `requestedByDisplayName` (or `"unknown"`),
`requestedAt`, `requestedPolicyDomains`, `purposeLabel`, `consentStatus`,
`permissiblePurposeStatus`, `providerConfigured` (default false), and `livePullMode`
(only `disabled_by_default`).

**Result** (`AmlKycCreditBureauPolicyGateResult`): `status` of only
`blocked_no_live_pull`, `ready_for_future_configuration`, or `rejected`;
`livePullMode: disabled_by_default`; `livePullPerformed: false`;
`amlKycProviderCalled` / `ofacProviderCalled` / `fraudIdentityProviderCalled` /
`creditBureauProviderCalled: false`; `reportRetrieved: false`;
`scoreRetrieved: false`; `externalSystemChanged: false`;
`allowedForLivePullNow: false`; a clear no-live-pull message; deterministic
`blockers` / `warnings`; an optional `rejectedReason`; a deterministic
`policyGateProofId`; and a deterministic audit summary. There is **no** clear /
verified / approved / no_match / score_found / report_found status, and the proof
id (`policy_gate_no_live_pull_…`) is deliberately **not** a provider report id.

## 5. Why no sensitive identifiers are accepted

This gate carries only deal-scoped labels and policy/readiness status. It
**rejects** any request that carries a sensitive identifier-like field — `ssn`,
`tin`, `taxId`, `dob`, `dateOfBirth`, `accountNumber`, `routingNumber`,
`cardNumber`, `fullAddress`, `bureauReportId`, or `creditScore`. Sensitive
identifier handling and data minimization are deferred to a future, governed
design; they have no place in a disabled policy gate.

## 6. Rejection rules

`evaluateAmlKycCreditBureauPolicyGate` rejects: a missing deal identity
(`missing_identity`); an unsupported or empty domain set (`unsupported_domain`);
any `livePullMode` other than `disabled_by_default` (`invalid_live_pull_mode`);
any sensitive identifier field (`sensitive_identifier_present`); and any
suspicious executable / SQL / secret / SSN payload (`unsafe_payload`). When
`providerConfigured` is false the status is `blocked_no_live_pull`. Even when
`providerConfigured` is true, `allowedForLivePullNow` remains false in this phase.
A credit bureau request without a documented permissible purpose adds a blocker;
without collected consent it adds a warning — but nothing is pulled.

## 7. What is explicitly NOT implemented

No live pull (soft or hard); no AML/KYC, OFAC/sanctions, fraud/identity, or credit
bureau provider call; no report or score retrieval; no credentials; no SSN/TIN/DOB/
account handling; no customer data lookup; no fetch / XMLHttpRequest / axios; no
Graph / Outlook / Power Automate; no Dataverse/CRM write; no PATCH/POST/PUT/DELETE;
no schema migration; no custom API; no adverse action; no credit decisioning; no
AML/KYC pass/fail decisioning; no OFAC match result; no identity verification
result; no fake "clear / approved / verified / bureau score found / OFAC no match"
copy; no committee vote; no approve/deny/recommend action; no lifecycle/status/
stage mutation; no sample/mock data; no permission widening; no executable payload
path; no eval / Function constructor.

## 8. Safety posture

The gate is pure and synchronous; the panel is read-only (no buttons, forms, or
inputs). The deterministic `policyGateProofId` is derived from stable local inputs
(`dealRef | livePullMode | sorted domains`) via FNV-1a — no random UUID, no
network. Governance pins prove the absence of every forbidden token and that all
provider/retrieval/change flags and `allowedForLivePullNow` stay false in all
outcomes.

## 9. Future prerequisites for live AML/KYC and credit bureau

1. Approved providers (AML/KYC, OFAC, fraud/identity, bureau).
2. A permissible-purpose model (FCRA).
3. Borrower consent capture / storage.
4. GLBA / FCRA / ECOA / adverse-action review.
5. An OFAC / KYC audit model.
6. Identity data minimization.
7. A secret-storage plan (no client-side token).
8. A read-only service-account / security model.
9. DLP / security review.
10. A report retention policy.
11. A rollback / disable switch.

## 10. Acceptance commands

```
npm test -- aml kyc bureau policyGate policyGates integrations governance releaseCandidateSnapshot
npm run build
npm test
```

## 11. Next recommended phase

**Phase 142R — Servicing lifecycle read-only Dataverse mapper.**
