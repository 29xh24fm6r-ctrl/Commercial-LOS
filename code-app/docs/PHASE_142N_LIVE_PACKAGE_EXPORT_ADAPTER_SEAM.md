# Phase 142N — Live Package Export Adapter Seam (Disabled by Default)

> **What this is.** A DISABLED-BY-DEFAULT adapter seam for a FUTURE live credit
> committee-package export. It defines the boundary shape and proves the current
> default behavior is disabled / fail-closed. It exports NOTHING live: no file
> upload, no email send, no Outlook/Graph/Power Automate call, no fetch, no
> Dataverse/CRM write, no external delivery, no committee vote/approval. Every
> outcome keeps `liveExportPerformed`, `externalDeliveryPerformed`, `fileUploaded`,
> and `emailSent` false.

## 1. What was added

| File | Role |
|---|---|
| `src/committee/creditPackageExportAdapter.ts` | Export request/result types, `prepareCreditPackageExportRequest`, `submitCreditPackageExport`, deterministic seam proof id |
| `src/committee/CreditPackageExportPanel.tsx` | Read-only "disabled by default" export-seam panel |

The panel is exported and tested but **not mounted to any route or queue** in this
phase — mounting is deferred so no access is widened and no new loader is added.

## 2. Why it is disabled by default

Live package export touches files, email, and external systems with regulatory
weight. The bank-safe posture forbids any live export until policy, transport due
diligence, permission controls, and audit verification exist. This phase proves
only the **boundary shape and disabled audit trail** so a future, governed live
export can be designed against a known contract — with zero live risk today.

## 3. Adapter request / result shape

**Request** (`CreditPackageExportRequest`): `packageId` / `dealId`, `dealName`,
`clientName`, optional `packageGeneratedAt`, `committeeReadinessStatus`,
`evidenceCount`, `blockerCount`, `missingEvidenceCount`, `requestedByDisplayName`
(or `"unknown"`), `requestedAt`, `destinationKind` (only `"disabled_placeholder"`),
and `mode` (only `"disabled_by_default"`).

**Result** (`CreditPackageExportResult`): `status` of only `"disabled"` or
`"rejected"`, `mode: "disabled_by_default"`, `liveExportPerformed: false`,
`externalDeliveryPerformed: false`, `fileUploaded: false`, `emailSent: false`, a
clear not-enabled message, an optional `rejectedReason`, a deterministic
`exportSeamProofId`, and a deterministic audit summary. There is **no** success /
exported / sent / uploaded status.

## 4. Rejection rules

`submitCreditPackageExport` rejects: a missing package/deal identity
(`missing_identity`); any `destinationKind` other than `"disabled_placeholder"`
(`invalid_destination`); any `mode` other than `"disabled_by_default"`
(`invalid_mode`); and any suspicious executable / SQL / secret / PII payload
(`unsafe_payload`). For a valid request it returns `disabled` — never success.

## 5. What is explicitly NOT implemented

No live package export; no file upload; no email send; no Outlook/Graph/Power
Automate call; no fetch / XMLHttpRequest / axios; no Dataverse/CRM write; no
PATCH/POST/PUT/DELETE; no schema migration; no custom API; no committee vote; no
approve/deny/recommend action; no lifecycle/status/stage mutation; no fake
"exported successfully" copy; no fake live destination; no fake delivery
confirmation; no permission widening; no executable payload path; no eval /
Function constructor.

## 6. Safety posture

The adapter is pure and synchronous; the panel is read-only (no buttons, forms,
or inputs). The deterministic `exportSeamProofId` is derived from stable local
inputs (`packageRef | mode | destinationKind`) via FNV-1a — no random UUID, no
network. Governance pins prove the absence of every forbidden token and that all
four live-effect flags stay false in all outcomes.

## 7. Future prerequisites for live export

1. Documented policy approval for live export of committee packages.
2. Vendor / transport due diligence and a reviewed export transport.
3. Permission controls and human authorization per export.
4. Complete, immutable audit logging of every real export.
5. DLP / security review for file and email delivery.
6. Test gates green and an explicit, human-reviewed enablement.

## 8. Acceptance commands

```
npm test -- creditPackageExport package export committee governance releaseCandidateSnapshot
npm run build
npm test
```

## 9. Next recommended phase

**Phase 142O — E-sign envelope adapter seam, disabled by default.**
