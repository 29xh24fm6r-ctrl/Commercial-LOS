# Borrower Portal — Schema Proposal (DESIGN ONLY, no tables created)

**Status: proposal, not implementation.** None of the eight tables below exist. None will be
created until the external authentication and security architecture this proposal depends on is
separately reviewed and approved — that review is Category 5 work (missing external authentication
architecture), one level below "ready to provision" in the Dataverse remediation classification.
This document exists so that review has something concrete to react to.

## 0. The prerequisite this whole proposal depends on

Every existing identity concept in this codebase — `cr664_platformuser`, `cr664_user`,
`systemuser`, `cr664_banker` — is an **internal** identity, provisioned for employees inside the
bank's own Entra tenant. A borrower is not, and must never become, any of those. Power Apps Code
Apps (what this repository is) authenticate against the bank's own Entra tenant; there is no
supported path to let an arbitrary external consumer sign into this same Code App. Concretely, this
means:

- **The borrower portal cannot be a feature bolted onto this Code App.** It needs its own
  application surface (a separate web app, or a separate Power Pages / custom SPA), authenticated
  by an external-identity product (Microsoft Entra External ID is the natural fit given the rest of
  this stack is already Microsoft/Power Platform; a third-party IdP federated in is the alternative).
  This is a genuine new application, not a new screen in the existing one.
- **Borrowers must never query Dataverse directly from their browser session.** Internal users
  reach Dataverse through the Power Apps Code App SDK, which resolves identity from the signed-in
  Entra employee. A borrower has no equivalent trusted path. The portal needs its own constrained
  API layer (or a very disciplined use of Dataverse Access Teams + row-level security) that mediates
  every borrower request against the access-grant table below — the grant table is the single
  source of truth an API layer checks on every call, never something a borrower's client reads
  directly.
- **None of this is resolved by adding tables.** Schema is necessary but not sufficient; the
  authentication provider decision, the API/mediation layer, and the security-role model for the
  Dataverse application user the portal API runs as are all separate, larger decisions than "what
  columns does this table have."

The eight tables below assume that architecture exists; they do not create it.

## 1. `cr664_borrowerportaluser`

**Purpose**: A borrower's portal identity — the record linking an external IdP identity to a
borrower/contact and everything the portal shows them.

| | |
|---|---|
| Primary name | `cr664_name` — borrower display name |
| Alternate key | `cr664_externalobjectid` (unique) — the IdP's immutable subject/object id (the `oid` claim, never email, since email can change) |
| Ownership | **Organization-owned.** Access is entirely mediated by `cr664_borrowerportalaccessgrant`, never by Dataverse row ownership — a borrower is never a `systemuser` and can never be an owner. |
| State/status | `statecode` Active/Inactive; separate `cr664_status` business choice (Invited / Active / Suspended / Deactivated) so a Suspended account can stay `statecode=Active` while blocked at the app layer with an audit trail, distinct from a hard Deactivated. |
| Retention/audit | Retain for the life of any deal relationship plus the statutory lending-record retention period (confirm exact duration with compliance/OGB policy — not asserted here). Every login, consent, and access-grant change is audited via the existing `cr664_auditevents` infrastructure, same pattern as every other governed write in this app. |
| Borrower-visible boundary | A borrower may read only their own row. |
| External identity linkage | `cr664_externalobjectid` 1:1 to the external IdP subject. Zero overlap with `cr664_platformuser`/`cr664_user` — a fully disjoint identity space. |

**Fields**: `cr664_externalobjectid` (Text, required), `cr664_email` (Text, required),
`cr664_fullname` (Text), `cr664_phonenumber` (Text, optional), `cr664_relatedcontact` (Lookup,
optional — target TBD: `cr664_crmperson` or `cr664_mastercontact` both exist in the solution for
different purposes; confirm which is the borrower-facing CRM record before wiring this, do not
guess), `cr664_status` (Choice), `cr664_lastloginat` (DateTime, optional), `cr664_mfaenrolled`
(Boolean), `cr664_activeflag` (Boolean).

**Relationships**: 1:N to `cr664_borrowerportalaccessgrant`, `cr664_borrowerconsent`,
`cr664_borrowerconversation` (as participant), `cr664_borrowernotification` (as recipient),
`cr664_borrowerdocumentaccess`.

## 2. `cr664_borrowerportalinvitation`

**Purpose**: The controlled onboarding flow — a banker-initiated invitation to a specific deal,
never auto-provisioned access.

| | |
|---|---|
| Primary name | `cr664_name` — e.g. "Invitation: borrower@example.com — Acme Expansion" |
| Alternate key | `cr664_invitationtoken` (unique) — a securely-random single-use token, ideally stored in a Dataverse encrypted column, never a raw Dataverse GUID exposed in the invite link (GUIDs are enumerable/guessable in a way a properly-random token is not) |
| Ownership | Organization-owned. |
| State/status | `statecode` Active/Inactive; `cr664_status` (Pending / Accepted / Expired / Revoked) — an invitation is never deleted, only marked terminal, for a complete audit trail. |
| Retention/audit | Every send/accept/revoke audited. Retained at least as long as the portal user record it may create. |
| Borrower-visible boundary | The unauthenticated invitee interacts only via the token link; zero Dataverse query access until server-side token validation (match + not expired + not already accepted) succeeds. |
| External identity linkage | None until accepted — this table is the bridge *before* an external identity exists. Links to the newly-created `cr664_borrowerportaluser` on acceptance. |

**Fields**: `cr664_invitationtoken` (Text, required), `cr664_email` (Text, required), `cr664_deal`
(Lookup → `cr664_loandeal`, required), `cr664_invitedby` (Lookup → `cr664_user`, required — the
proven `cr664_user`-via-`cr664_platformusers`-bridge pattern this session already established for
`cr664_ChangedBy`/`cr664_EventBy`, never a raw `systemuser` bind), `cr664_status` (Choice),
`cr664_expiresat` (DateTime, required), `cr664_acceptedat` (DateTime, optional),
`cr664_borrowerportaluser` (Lookup, optional, set on acceptance).

**Relationships**: N:1 `cr664_loandeal`; N:1 `cr664_user` (invitedby); N:1
`cr664_borrowerportaluser` (once accepted).

## 3. `cr664_borrowerportalaccessgrant`

**Purpose**: The authorization record — the single source of truth the portal's API layer checks on
every request. This table is the actual security boundary; everything else is content gated by it.

| | |
|---|---|
| Primary name | `cr664_name` — e.g. "borrower@example.com — Acme Expansion — Full Access" |
| Alternate key | Composite on (`cr664_borrowerportaluser`, `cr664_deal`) — Dataverse supports multi-column alternate keys; this prevents duplicate/conflicting grants for the same borrower+deal pair. |
| Ownership | Organization-owned. |
| State/status | `statecode` Active/Inactive; `cr664_activeflag` is the field the API layer actually checks — never infer "active" from mere row presence; a revoked-but-undeleted row must read unambiguously inactive. |
| Retention/audit | Every grant/revoke is itself audit-worthy (who authorized borrower access to what, when) — mirrors this app's "every write emits an audit event" discipline throughout. Never deleted; revoke, don't delete, for a complete access history. |
| Borrower-visible boundary | **This table itself is never borrower-readable.** It is the authorization list, read server-side only, never exposed to a borrower's client directly. |
| External identity linkage | Indirect, via `cr664_borrowerportaluser`. |

**Fields**: `cr664_borrowerportaluser` (Lookup, required), `cr664_deal` (Lookup →
`cr664_loandeal`, required), `cr664_accesslevel` (Choice: ViewOnly / MessagingEnabled /
DocumentUploadEnabled / Full), `cr664_grantedby` (Lookup → `cr664_user`, required),
`cr664_grantedat` (DateTime, required), `cr664_revokedat` (DateTime, optional), `cr664_revokedby`
(Lookup → `cr664_user`, optional), `cr664_activeflag` (Boolean).

## 4. `cr664_borrowerconsent`

**Purpose**: A compliance-required record of explicit borrower consent (ESIGN electronic-
communication consent, privacy policy, terms of service) — a legal artifact, not a UX nicety.

| | |
|---|---|
| Primary name | `cr664_name` — e.g. "borrower@example.com — ESIGN Consent — v2" |
| Alternate key | Composite (`cr664_borrowerportaluser`, `cr664_consenttype`, `cr664_consentversion`) — a borrower accumulates versioned consent records as terms change over time; never overwritten. |
| Ownership | Organization-owned. |
| State/status | `statecode` Active (in effect) / Inactive (revoked or superseded by a newer version) — never physically deleted; it is a legal record. |
| Retention/audit | Indefinite or statutory minimum — confirm with compliance; ESIGN consent records typically need retention for the life of the loan plus several years. Not asserted here as fact. |
| Borrower-visible boundary | A borrower may read only their own consent history. |
| External identity linkage | Via `cr664_borrowerportaluser`. |

**Fields**: `cr664_borrowerportaluser` (Lookup, required), `cr664_consenttype` (Choice:
ESIGNConsent / PrivacyPolicy / CommunicationConsent / TermsOfService), `cr664_consentversion`
(Text, required — the exact document version consented to), `cr664_consentedat` (DateTime,
required), `cr664_ipaddress` (Text, optional — captured for legal defensibility), `cr664_useragent`
(Text, optional), `cr664_revokedat` (DateTime, optional).

## 5. `cr664_borrowerconversation`

**Purpose**: A thread container for borrower-bank messaging on a specific deal — groups individual
`cr664_borrowermessage` rows, deliberately separate from `cr664_dealtimelineevent` (which carries
internal-only activity a borrower must never see).

| | |
|---|---|
| Primary name | `cr664_name` — e.g. "Acme Expansion — Borrower Conversation" |
| Alternate key | Unique on `cr664_deal`, **if** the product decision is one thread per deal (recommended for v1). No alternate key if multiple threads per deal (e.g. per topic) are wanted instead — a real decision to make explicitly before provisioning, not assumed here. |
| Ownership | **User-owned** by the assigned banker/relationship manager, mirroring `cr664_loandeal`'s own ownership convention — the banker side needs normal Dataverse security-role visibility into their book of business. The borrower side is authorized separately via the access-grant table, never via Dataverse ownership (a borrower cannot own a Dataverse record). |
| State/status | `statecode` Active/Inactive; `cr664_status` (Open / Closed / Archived) for the business lifecycle. |
| Retention/audit | Same retention as the parent deal record. |
| Borrower-visible boundary | A borrower sees a conversation only when they are the named `cr664_borrowerportaluser` on it **and** hold an active access grant (MessagingEnabled or Full) for that deal — both conditions checked, not either alone. |
| External identity linkage | Via `cr664_borrowerportaluser`. |

**Fields**: `cr664_deal` (Lookup, required), `cr664_borrowerportaluser` (Lookup, required),
`cr664_subject` (Text, optional), `cr664_status` (Choice), `cr664_lastmessageat` (DateTime,
optional — denormalized for a fast "recent conversations" list).

## 6. `cr664_borrowermessage`

**Purpose**: An individual message within a conversation, sent by either the borrower or an
authorized banker.

| | |
|---|---|
| Primary name | `cr664_name` — truncated message preview or "Message from X at T" |
| Alternate key | None — append-only content with no natural business key. |
| Ownership | Organization-owned; access is grant-mediated, not ownership-mediated. |
| State/status | `statecode` Active only. Messages are immutable once sent — a mistaken message is corrected by a follow-up message, never edited or deleted, matching this codebase's existing "governed writes are never silently corrected" discipline. |
| Retention/audit | Same retention as the parent conversation/deal. Every send emits a `cr664_auditevent` (sender identity, timestamp, conversation, correlation id) through the existing audit infrastructure. |
| Borrower-visible boundary | Same double-check as the parent conversation. **A message must never be visible to a different borrower on the same deal** (e.g. a co-borrower) unless co-borrowers sharing one thread is an explicit product decision — not assumed by this proposal. |
| External identity linkage | Via `cr664_borrowerportaluser` (borrower sender) or the `cr664_user` bridge (banker sender). |

**Fields**: `cr664_conversation` (Lookup, required), `cr664_sendertype` (Choice: Borrower / Banker /
System), `cr664_senderborrowerportaluser` (Lookup, optional, set when senderType=Borrower),
`cr664_senderuser` (Lookup → `cr664_user`, optional, set when senderType=Banker),
`cr664_body` (Memo, required — **must** pass through the same borrower-safe-content review this
codebase already enforces for outbound borrower communication, e.g. the recipient-masking / safe-
copy discipline in `src/deals/emailDelivery/`; a message must never leak an internal-only field
like a risk rating or internal note), `cr664_sentat` (DateTime, required), `cr664_readat` (DateTime,
optional — read receipt), `cr664_attachmentdocumentaccess` (Lookup →
`cr664_borrowerdocumentaccess`, optional).

## 7. `cr664_borrowernotification`

**Purpose**: The delivery record for an out-of-band notification (email/SMS/push) — separate from
the content itself, mirroring this codebase's existing separation between a governed write and its
external send (see `src/deals/emailDelivery/emailMode.ts`'s DRY_RUN/LIVE discipline).

| | |
|---|---|
| Primary name | `cr664_name` — e.g. "NewMessage to borrower@example.com at T" |
| Alternate key | None. |
| Ownership | Organization-owned (system-generated). |
| State/status | `statecode` Active; `cr664_deliverystatus` (Pending / Sent / Delivered / Failed) is the real lifecycle tracker — never claim "Sent" without a genuine transport confirmation, mirroring this app's existing DRY_RUN/LIVE honesty pattern for borrower-facing sends. |
| Retention/audit | Shorter operational retention than core records (e.g. 90–180 days) unless compliance requires longer — a policy decision, not asserted here. |
| Borrower-visible boundary | A borrower may read their own notification history/preferences only. |
| External identity linkage | Via `cr664_borrowerportaluser`. **The actual send already routes through existing, currently-off infrastructure** — `BORROWER_EMAIL_TRANSPORT_ENABLED` / `BORROWER_SMS_TRANSPORT_ENABLED` / `BORROWER_TWILIO_TRANSPORT_ENABLED` in `src/deals/dealOriginationFeatureFlags.ts` are already the governed gates for any real external send; this table doesn't need new transport infrastructure, only a new record type flowing through what's already there. |

**Fields**: `cr664_borrowerportaluser` (Lookup, required), `cr664_notificationtype` (Choice:
NewMessage / DocumentRequested / StatusChange / InvitationReminder), `cr664_channel` (Choice: Email
/ SMS / Push), `cr664_deliverystatus` (Choice), `cr664_relatedconversation` (Lookup, optional),
`cr664_relateddocumentaccess` (Lookup, optional), `cr664_sentat` (DateTime, optional),
`cr664_failurereason` (Text, optional).

## 8. `cr664_borrowerdocumentaccess`

**Purpose**: The borrower-facing counterpart to this same remediation's internal document-upload
work (`cr664_documentchecklist`'s new File column) — tracks which documents a specific borrower can
see, and any upload activity the borrower themself performs through the portal.

| | |
|---|---|
| Primary name | `cr664_name` — e.g. "Tax Returns — borrower@example.com access" |
| Alternate key | Composite (`cr664_borrowerportaluser`, `cr664_documentchecklist`) — one access record per borrower per document. |
| Ownership | Organization-owned. |
| State/status | `statecode` Active/Inactive — revocable (e.g. a document shared in error). |
| Retention/audit | Same retention as the parent document/deal. Every grant and every borrower upload emits an audit event. |
| Borrower-visible boundary | **The default is "not visible."** A borrower sees only documents explicitly granted via a row here — never "every document on the deal" by default. This is the opposite default from the internal banker view and must be enforced as an explicit allow-list, not an implicit deny-list. |
| External identity linkage | Via `cr664_borrowerportaluser`. |

**Fields**: `cr664_borrowerportaluser` (Lookup, required), `cr664_documentchecklist` (Lookup →
`cr664_documentchecklist`, required), `cr664_accesstype` (Choice: ViewOnly / UploadRequested /
Uploaded), `cr664_grantedat` (DateTime, required), `cr664_borroweruploadedat` (DateTime, optional —
**a borrower's own upload must attribute to `cr664_borrowerportaluser`, never to
`cr664_uploadedby`/`cr664_user`** — that lookup, provisioned in this same remediation pass via
`scripts/dataverse/create-document-checklist-file-columns.ps1`, is for internal-actor uploads only;
conflating the two identity spaces on one column would silently let a borrower's upload masquerade
as an employee's, or vice versa).

## Open decisions requiring approval before any table is provisioned

1. **External IdP selection** (Entra External ID vs. a third-party provider) — architecture
   decision, not a schema decision, and the actual prerequisite everything above depends on.
2. **Portal application shape** — separate web app vs. Power Pages vs. another approach; who builds
   and hosts the borrower-facing API layer that mediates Dataverse access.
3. **`cr664_borrowerportaluser.cr664_relatedcontact` target** — `cr664_crmperson` or
   `cr664_mastercontact`; confirm against the live CRM schema before wiring, not guessed here.
4. **One conversation thread per deal, or per topic** — affects whether
   `cr664_borrowerconversation.cr664_deal` gets a unique alternate key.
5. **Co-borrower message visibility** — do co-borrowers on the same deal share one conversation
   thread, or does each get an isolated one requiring the bank to relay between them.
6. **Retention durations** — confirm exact statutory periods for consent records, portal user
   records, and notification records with compliance/OGB policy; this document deliberately does
   not assert specific numbers as fact.
7. **Invitation token storage** — confirm Dataverse encrypted-column support is used for
   `cr664_invitationtoken` rather than plaintext, given it's effectively a bearer credential for
   account setup.
