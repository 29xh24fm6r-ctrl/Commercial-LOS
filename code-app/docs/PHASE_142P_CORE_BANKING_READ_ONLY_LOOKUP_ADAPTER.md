# Phase 142P — Core Banking Read-Only Lookup Adapter Seam (Disabled by Default)

> **What this is.** A DISABLED-BY-DEFAULT adapter seam for a FUTURE read-only core
> banking relationship lookup (borrower / customer / deposit / loan relationship
> context). It defines the boundary shape and renders honest disabled UI while
> proving all live core actions remain impossible by default. It connects to NO
> core, calls NO API, reads NO live customer/account/balance/transaction data,
> stores NO credential, mutates NOTHING, and moves NO money. **This is a seam only
> — no live core banking integration.**

## 1. What was added

| File | Role |
|---|---|
| `src/integrations/coreBanking/coreBankingLookupAdapter.ts` | Provider/request/result types, `prepareCoreBankingLookupRequest`, `submitCoreBankingLookup`, deterministic seam proof id |
| `src/integrations/coreBanking/CoreBankingLookupPanel.tsx` | Read-only "disabled by default" core banking lookup seam panel |

The panel is exported and tested but **not mounted to any route** in this phase —
mounting is deferred so no access is widened and no new loader is added.

## 2. Why it is disabled by default

Core banking lookups touch customer, account, balance, and transaction data under
GLBA / privacy obligations. The bank-safe posture forbids any live core action
until policy, a read-only service-account security model, permitted-query rules,
and audit verification exist. This phase proves only the **boundary shape and
disabled audit trail** so a future, governed read-only lookup can be designed
against a known contract — with zero live risk today.

## 3. Adapter request / result shape

**Request** (`CoreBankingLookupRequest`): `dealId`, `dealName`, `clientName`,
`borrowerLabel`, `lookupKind` (`borrower_relationship` | `customer_profile` |
`deposit_relationship` | `loan_relationship` | `disabled_placeholder`),
`requestedByDisplayName` (or `"unknown"`), `requestedAt`, `provider` (only
`"core_banking"`), and `mode` (only `"disabled_by_default"`).

**Result** (`CoreBankingLookupResult`): `status` of only `"disabled"` or
`"rejected"`, `provider: "core_banking"`, `mode: "disabled_by_default"`,
`liveLookupPerformed: false`, `customerDataRetrieved: false`,
`accountDataRetrieved: false`, `balanceDataRetrieved: false`,
`transactionDataRetrieved: false`, `externalSystemChanged: false`, a clear
not-enabled message, an optional `rejectedReason`, a deterministic
`lookupSeamProofId`, and a deterministic audit summary. There is **no** success /
found / matched / retrieved / verified status, and the proof id
(`core_lookup_seam_disabled_…`) is deliberately **not** a real core / customer /
account id.

## 4. Why no sensitive identifiers are accepted

This seam carries only deal-scoped labels. It **rejects** any request that carries
a sensitive identifier-like field — `ssn`, `tin`, `taxId`, `dob`, `dateOfBirth`,
`accountNumber`, `routingNumber`, `cardNumber`, or `fullAddress`. Sensitive
identifier handling is deferred to a future, governed design with explicit privacy
controls; it has no place in a disabled boundary seam.

## 5. Rejection rules

`submitCoreBankingLookup` rejects: a missing deal identity (`missing_identity`);
any `provider` other than `"core_banking"` (`invalid_provider`); any `mode` other
than `"disabled_by_default"` (`invalid_mode`); an unsupported `lookupKind`
(`unsupported_lookup_kind`); any sensitive identifier field
(`sensitive_identifier_present`); and any suspicious executable / SQL / secret /
SSN payload (`unsafe_payload`). For a valid request it returns `disabled` — never
success.

## 6. What is explicitly NOT implemented

No live core banking call; no credentials; no customer/account/deposit/loan
lookup; no balance or transaction inquiry; no CIF / customer-profile retrieval; no
fetch / XMLHttpRequest / axios; no Graph / Outlook / Power Automate; no
Dataverse/CRM write; no PATCH/POST/PUT/DELETE; no schema migration; no custom API;
no account opening; no transfer / payment / money movement; no OFAC / KYC / AML
decisioning; no credit decisioning; no committee vote; no approve/deny/recommend
action; no lifecycle/status/stage mutation; no fake "core match found" copy; no
fake customer/account/balance data; no sample/mock data; no permission widening;
no executable payload path; no eval / Function constructor.

## 7. Safety posture

The adapter is pure and synchronous; the panel is read-only (no buttons, forms, or
inputs). The deterministic `lookupSeamProofId` is derived from stable local inputs
(`dealRef | provider | mode | lookupKind`) via FNV-1a — no random UUID, no
network. Governance pins prove the absence of every forbidden token and that all
six retrieval/change flags stay false in all outcomes.

## 8. Future prerequisites for live core banking read-only lookup

1. An approved core provider / API approach (scopes, environments, rate limits).
2. A secret-storage plan (no client-side token; secured server/connector secret).
3. A read-only service-account / security model (least privilege, no write scopes).
4. Permitted query identifiers (which keys may be used; how they are validated).
5. An audit-logging model for every read.
6. Customer privacy / GLBA controls.
7. DLP / security review.
8. A no-money-movement guarantee (read-only by construction).
9. A rollback / disable switch.

## 9. Acceptance commands

```
npm test -- coreBanking CoreBanking lookup integrations committee governance releaseCandidateSnapshot
npm run build
npm test
```

## 10. Next recommended phase

**Phase 142Q — AML/KYC and credit bureau policy gate, no live pull.**
