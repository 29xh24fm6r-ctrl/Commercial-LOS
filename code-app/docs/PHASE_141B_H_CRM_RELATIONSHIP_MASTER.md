# Phase 141B-H — CRM Relationship Master

> **What this is.** The bank's CRM relationship master: organizations, people,
> contact points, relationships, role assignments, communication preferences,
> contact authorizations, vendors, customers, guarantors, internal contacts,
> advisors, a timeline, and an audit trail — with fail-closed contact/outreach/
> upload-link readiness, a relationship network snapshot, contact-task
> derivation, a borrower request **recipient resolver**, read-only command-center
> panels, a disabled persistence adapter, a Dataverse schema **plan only**, and
> optional annual-review / portfolio-boarding integration seams.

## Purpose

Relationship management is the connective tissue of the LOS: who the borrower
is, who to contact, on which channel, whether they may be contacted, and whether
they have authorized document collection. Phase 141B-H builds that master and
the engines that make annual-review and boarding workflows contact-aware —
without sending anything.

## Domain model

`src/shared/crm/crmTypes.ts` defines organizations, people, contact points,
relationships, role assignments, communication preferences, contact
authorizations, timeline events, and audit entries, plus the `CrmMaster`
aggregate and typed views (customer / vendor / guarantor / advisor / internal).

## Readiness engine

`deriveCrmContactReadiness` is **fail-closed**: no usable contact point → not
contact-ready; **do-not-contact blocks outreach**; a **missing or expired
document-upload authorization blocks upload-link readiness**. It never exposes
the raw email/phone value.

## Relationship network snapshot

`deriveCrmRelationshipNetworkSnapshot` projects the master into nodes/edges +
per-organization rollups + portfolio gaps (orgs missing contact, do-not-contact
people, authorization gaps). Empty master → empty snapshot (no fake nodes).

## Contact task derivation

`deriveCrmContactTasks` derives data-hygiene tasks (add primary contact, verify
contact point, collect/renew authorization, resolve do-not-contact conflict,
assign relationship owner). It writes nothing and fakes no completion.

## Borrower request recipient resolver

`resolveBorrowerRequestRecipient` resolves who an annual-review borrower request
would go to (by loan id or borrower org), honoring do-not-contact and upload
authorization. **Annual review contact readiness must fail closed** — the
integration seam reports `annualReviewContactReady` only when outreach **and**
upload-link are both ready. It sends nothing.

## Command center / panels

`CrmRelationshipCommandCenter` + `CrmRelationshipNetworkPanel` +
`CrmContactTaskBoard` are read-only: pure derivation from authorized data, no
data loading, no write affordance, honest empty states.

## Persistence + schema

The CRM persistence adapter is **disabled by default** (every operation fails
closed with `not_configured`; there is no delete). `crmDataverseSchemaPlan`
declares the target tables/relationships/option sets — **schema plan only, no
schema creation** in this phase.

## Optional integration seams

`crmIntegrationSeams` provides pure, read-only bridges:
- `resolveAnnualReviewContactReadiness(master, loanId)` — recipient + fail-closed
  contact readiness for an annual-review request (141A stays preview-only).
- `resolveBoardedLoanCrmLink(master, loanId)` — the CRM org linked to a boarded
  loan (`linked: false` honestly when absent).

## Safety posture

- **No fake customer / vendor / contact data**, no sample emails or phone
  numbers in production code, no placeholder company names.
- **No automatic borrower outreach** — no email / SMS / Twilio / mailto
  primitives, no upload-link sending.
- **No live CRM writes** by default; no delete operations.
- **No route registered** in `App.tsx`; no permission widening.
- **No direct fetch / Dataverse** calls in CRM React components.
- Missing contact means missing; **do-not-contact blocks outreach**; missing
  authorization blocks upload-link readiness; annual-review contact readiness is
  **fail-closed**.

## What is intentionally not built

- No live CRM persistence / schema creation.
- No borrower outreach, upload-link generation, or messaging.
- No automatic relationship inference; relationships are explicit records.

## Next recommended phases

- **141I** — CRM Dataverse schema inspection / guarded seed.
- **141J** — CRM live persistence adapter (disabled by default).
- **141K** — CRM operator UI for relationship/contact maintenance.
- **141L** — Annual-review borrower request workflow on the CRM recipient
  resolver (still adapter-gated, no auto-send).
