# Phase 141N — Borrower Delivery Adapter Seams (Disabled by Default, Approval-Gated)

> **What this is.** Safe adapter seams for *future* borrower upload-link
> generation, email delivery, and SMS delivery on annual-review borrower
> requests. This phase **sends nothing**, generates no live upload links, and
> contacts no borrower. It introduces only disabled-by-default, approval-gated
> adapter contracts, preview models, a validation gate, and governance pins.

## 1. Purpose

Annual-review workflows will eventually need controlled delivery channels —
secure upload request links, email delivery, SMS notification — each with human
approval tracking and adapter-level readiness/validation. This phase creates the
seams so those capabilities can be integrated later **without cutting safety
corners**. No live send happens here.

## 2. Prerequisites

- **Phase 141A** — annual portfolio review collection command center.
- **Phase 141B-H** — CRM Relationship Master.
- **Phase 141J-K** — CRM Dataverse schema (created + verified).
- **Phase 141L** — CRM live persistence adapter (disabled by default).
- **Phase 141M** — annual-review borrower request workflow (human-approval preview).

## 3. What this phase adds

| File | Role |
|---|---|
| `annualReviewDeliveryFeatureFlags.ts` | Delivery flags (send off, dry-run on, approval required) |
| `annualReviewDeliveryTypes.ts` | Channels, intents, approvals, previews, results (no `sent` state) |
| `validateAnnualReviewDeliveryRequest.ts` | Fail-closed validation gate |
| `annualReviewUploadLinkAdapter.ts` | Upload-link adapter seam (disabled) |
| `annualReviewEmailDeliveryAdapter.ts` | Email adapter seam (disabled) |
| `annualReviewSmsDeliveryAdapter.ts` | SMS adapter seam (disabled) |
| `resolveAnnualReviewDeliveryAdapters.ts` | Resolver + `previewDelivery` / `attemptDelivery` facade |
| `buildAnnualReviewDeliveryAuditSummary.ts` | Redacted audit summary builder |
| `AnnualReviewBorrowerRequestPanel.tsx` | Delivery readiness section (read-only) |

## 4. What remains disabled

- **Live upload links** — no token, no live URL; `createUploadLink` always blocked.
- **Email sending** — no Outlook / Gmail / Graph / Office365 / SMTP / `mailto` /
  `SendEmailV2`; `sendEmail` always blocked.
- **SMS sending** — no Twilio / SMS provider; `sendSms` always blocked.
- **External transport** — adapters take an optional injected transport but never
  use it to send in this phase; no `fetch` anywhere.
- **Borrower outreach** — nothing is delivered to a borrower.
- **CRM writes / Dataverse writes** — the delivery layer performs none.

## 5. Approval-gated model

Every outbound or link-generation action is blocked by default and requires —
in a future phase — explicit human approval, feature flags, recipient
authorization, contact-preference validation, delivery-channel validation, and
adapter readiness. In this phase `attemptDelivery` is **always blocked** (send
disabled + dry-run only), and `safeForSend` from Phase 141M remains false.

The validation gate (`validateAnnualReviewDeliveryRequest`) splits two gates:
- **Recipient gate** (blocks preview): do-not-contact, restricted-use, missing
  authorization, missing/mismatched contact point, channel preference.
- **Send gate** (always blocks a live action here): approval required, send
  disabled, dry-run only.

So a *preview* is allowed for an eligible recipient, while a live *send* is
structurally impossible in this phase.

## 6. Security posture

- **Masked contacts** — previews and audit summaries carry only a masked value
  (e.g. `•••@•••`), never a raw email or phone; raw values are redacted.
- **No raw tokens** — upload-link previews carry `hasToken: false` and no token.
- **No live URLs** — previews carry `hasLiveUrl: false` and no URL; audit
  summaries set `containsLiveUrl: false`.
- **No `mailto:` / SMS links** — none are produced anywhere.
- **No hidden sends** — there is no terminal `sent` / `delivered` /
  `failed_delivery` state, and the panel exposes no Send / Email / Text /
  Generate upload link / Approve-and-send / Retry control.

## 7. Next recommended phase

**Phase 141O — Financial spreading and covenant testing integration for annual
reviews.**
