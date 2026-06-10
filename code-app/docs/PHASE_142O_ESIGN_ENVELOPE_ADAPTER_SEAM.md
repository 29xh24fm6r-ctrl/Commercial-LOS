# Phase 142O — E-sign Envelope Adapter Seam (PandaDoc, Disabled by Default)

> **What this is.** A DISABLED-BY-DEFAULT adapter seam for a FUTURE PandaDoc-based
> e-signature workflow. **PandaDoc is the intended future provider** (Old Glory
> Bank holds a PandaDoc e-signature subscription), but this phase makes NO PandaDoc
> call, stores NO credentials/token, creates NO envelope, uploads NO document,
> looks up NO template, sends NO recipient email, and registers NO webhook. It
> defines the boundary shape and renders honest disabled UI while proving all live
> e-sign actions remain impossible by default. **This is a seam only — no live
> PandaDoc integration.**

## 1. Intended future provider

PandaDoc. This phase names PandaDoc only as disabled provider metadata
(`provider: "pandadoc"`). It connects to nothing, holds no API token, and
represents no live PandaDoc action as having occurred.

## 2. What was added

| File | Role |
|---|---|
| `src/committee/eSignEnvelopeAdapter.ts` | Provider/request/result types, `prepareESignEnvelopeRequest`, `submitESignEnvelope`, deterministic seam proof id |
| `src/committee/ESignEnvelopePanel.tsx` | Read-only "PandaDoc — disabled by default" e-sign seam panel |

The panel is exported and tested but **not mounted to any route or panel** in this
phase — mounting is deferred so no access is widened and no new loader is added.

## 3. Why it is disabled by default

Live e-signature sending touches documents, recipient identities, email, and an
external provider with regulatory weight. The bank-safe posture forbids any live
PandaDoc action until policy, secret storage, recipient-identity rules, and audit
verification exist. This phase proves only the **boundary shape and disabled audit
trail** so a future, governed PandaDoc integration can be designed against a known
contract — with zero live risk today.

## 4. Adapter request / result shape

**Request** (`ESignEnvelopeRequest`): `dealId` / `packageId`, `dealName`,
`clientName`, `documentLabel` / `packageLabel`, `signerCount`, `signerLabels`
(role labels only — never email addresses), optional `packageGeneratedAt`,
`requestedByDisplayName` (or `"unknown"`), `requestedAt`, `provider` (only
`"pandadoc"`), `mode` (only `"disabled_by_default"`), and `destinationKind` (only
`"disabled_pandadoc_placeholder"`).

**Result** (`ESignEnvelopeResult`): `status` of only `"disabled"` or `"rejected"`,
`provider: "pandadoc"`, `mode: "disabled_by_default"`, `liveEnvelopeCreated: false`,
`documentUploaded: false`, `recipientEmailSent: false`, `webhookRegistered: false`,
`externalDeliveryPerformed: false`, a clear not-enabled message, an optional
`rejectedReason`, a deterministic `envelopeSeamProofId`, and a deterministic audit
summary. There is **no** success / sent / created / uploaded / delivered status,
and the proof id (`esign_seam_disabled_…`) is deliberately **not** a real PandaDoc
envelope id.

## 5. Rejection rules

`submitESignEnvelope` rejects: a missing deal/package identity
(`missing_identity`); any `provider` other than `"pandadoc"` (`invalid_provider`);
any `mode` other than `"disabled_by_default"` (`invalid_mode`); any
`destinationKind` other than `"disabled_pandadoc_placeholder"`
(`invalid_destination`); and any suspicious executable / SQL / secret payload or
raw email address (`unsafe_payload`). For a valid request it returns `disabled` —
never success.

## 6. What is explicitly NOT implemented

No live PandaDoc call; no PandaDoc API token; no credential storage; no envelope
creation; no document upload; no template lookup; no recipient send; no email
send; no webhook; no fetch / XMLHttpRequest / axios; no Graph / Outlook / Power
Automate; no Dataverse/CRM write; no PATCH/POST/PUT/DELETE; no schema migration;
no custom API; no committee vote; no approve/deny/recommend action; no
lifecycle/status/stage mutation; no fake "sent for signature" copy; no fake live
PandaDoc envelope id; no fake delivery confirmation; no permission widening; no
executable payload path; no eval / Function constructor.

## 7. Safety posture

The adapter is pure and synchronous; the panel is read-only (no buttons, forms, or
inputs). The deterministic `envelopeSeamProofId` is derived from stable local
inputs (`packageRef | provider | mode | destinationKind`) via FNV-1a — no random
UUID, no network. Governance pins prove the absence of every forbidden token and
that all five live-effect flags stay false in all outcomes.

## 8. Future prerequisites for live PandaDoc integration

1. An approved PandaDoc API approach (scopes, environments, rate limits).
2. A secret-storage plan (no client-side token; secured server/connector secret).
3. A Dataverse audit / schema model if envelope persistence is needed.
4. Recipient identity rules (who may be a signer; how emails are sourced/validated).
5. Document / template versioning.
6. An envelope status lifecycle (draft → sent → viewed → signed → completed/voided).
7. A webhook security model (signature verification, replay protection).
8. DLP / security review for document and recipient-email handling.
9. A rollback / disable switch.

## 9. Acceptance commands

```
npm test -- eSign ESign pandadoc envelope committee governance releaseCandidateSnapshot
npm run build
npm test
```

## 10. Next recommended phase

**Phase 142P — Core banking read-only lookup adapter, disabled by default.**
