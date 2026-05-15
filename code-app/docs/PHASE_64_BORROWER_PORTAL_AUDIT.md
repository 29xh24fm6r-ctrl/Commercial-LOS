# Phase 64 — Borrower Portal MVP Scope Audit

**Phase posture:** `tests / docs only`. No production code changed.
No new tests added (this is an audit, not a regression sweep). No
schema work, no auth implementation, no new UI route, no new
write surface, no inventory drift.

**Question this phase answers:** what is the smallest borrower-portal
slice we can ship honestly against the platform as it stands today —
without tenant-admin action, without inventing auth, without
implying capabilities (upload, secure messaging, magic links) that
don't exist?

The answer is "very little, and the next correct phase may be `none
yet`." See §6 for the recommendation.

Related canonical sources:
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `NOT_WIRED`, `LOCAL_ONLY_FLOWS`, `WORKSPACE_DEAL_ACCESS`
- [src/bootstrap/bootstrapFlow.ts](../src/bootstrap/bootstrapFlow.ts) — current Entra → systemuser → workspace identity chain
- [src/bootstrap/workspaceRoutes.ts](../src/bootstrap/workspaceRoutes.ts) — five workspace roles; no borrower role
- [src/deals/DealRoute.tsx](../src/deals/DealRoute.tsx) — three-branch role dispatch; no borrower branch
- [src/deals/dealQueries.ts](../src/deals/dealQueries.ts) — `loadDealForBanker | loadDealForManager | loadDealForTeam`; no `loadDealForBorrower`
- [src/generated/models/Cr664_borrowersModel.ts](../src/generated/models/Cr664_borrowersModel.ts) — borrower entity (name only)
- [src/generated/models/Cr664_documentchecklistsModel.ts](../src/generated/models/Cr664_documentchecklistsModel.ts) — `cr664_uploadstatus` boolean; no File column
- [src/generated/models/Cr664_dealtimelineeventsModel.ts](../src/generated/models/Cr664_dealtimelineeventsModel.ts) — `cr664_visibilityscope` has no `BorrowerSafe` value; `BorrowerUpdateSent` event type exists but is never emitted
- [src/generated/models/Cr664_auditeventsModel.ts](../src/generated/models/Cr664_auditeventsModel.ts) — `cr664_entitytype` has no `Borrower` value; `cr664_ActorUser` binds to a systemuser
- [docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md), [docs/PHASE_62_OUTLOOK_LIVE_SEND.md](PHASE_62_OUTLOOK_LIVE_SEND.md), [docs/PHASE_63_EMAIL_HANDOFF_FALLBACK.md](PHASE_63_EMAIL_HANDOFF_FALLBACK.md) — three existing email pathways

---

## 1. Current platform reality (audited)

### 1.1 Generated services

Twenty-four typed services in `src/generated/services/`. The
borrower-portal-relevant ones:

- `Cr664_borrowersService` — exists. The `cr664_borrowers` entity has
  EXACTLY two domain columns: `cr664_borrowerid` and
  `cr664_borrowername`. No email, no phone, no contact column, no
  external identity, no portal-token column, no last-login column,
  no consent flag. Standard ownership + state columns only.
- `Cr664_loandealsService` — the deal entity has `cr664_Client@odata.bind`
  (optional reference). The audited model does not surface a
  `cr664_Borrower` field on the deal directly; the
  client-relationship reference is the closest existing link.
- `Cr664_documentchecklistsService` — checklist row has
  `cr664_uploadstatus` (boolean flag), `cr664_requestdate`,
  `cr664_receiveddate`, `cr664_reviewer` (free-text string). **No
  File column.** The boolean upload flag is metadata only.
- `Cr664_dealtimelineeventsService` — timeline visibility enum is
  `BankerAndManager | Team | ExecutiveSafe | AdminOnly`. **No
  `BorrowerSafe` / `External` value.**
- `Cr664_auditeventsService` — actor model is `cr664_ActorUser` →
  systemuser bind. Entity-type enum is `User | LoanDeal |
  PortfolioLoan | AnnualReview | Role | Configuration`. **No
  `Borrower` actor or subject.**
- No `Contacts`, `ExternalUsers`, `Invitations`, `MagicLinkTokens`,
  `BorrowerSessions`, or `SecureMessages` service exists. None.

### 1.2 Identity / auth chain (today)

`runBootstrap()` in [bootstrapFlow.ts](../src/bootstrap/bootstrapFlow.ts):

1. `getContext()` from `@microsoft/power-apps/app` → UPN +
   Entra ObjectId from the Bank's tenant.
2. `Cr664_usersService.getAll({ filter: \`cr664_email eq '<upn>'\` })`
   — there MUST be a `cr664_users` row whose `cr664_email` matches
   the Entra UPN, or `NotProvisionedError` throws.
3. `Cr664_losuserprofilesService` — the user must have a profile.
4. `Cr664_workspaceentitlementsesService` — the profile must have at
   least one entitlement.
5. `Cr664_platformworkspacesService` — the entitlement's workspace
   name must match one of five regexes:
   `banker | team | manager | executive|board | admin`. Otherwise
   `UnresolvedWorkspaceError`.

There is **no path** for an external user (a borrower) to get
through this chain today. Even adding `borrower` to the
`MATCHERS` regex would require:
- a Bank-tenant Entra identity for each borrower (tenant-admin
  invitation; a guest user), AND
- a provisioned `cr664_users` row keyed by the borrower's Entra
  email, AND
- a `cr664_losuserprofiles` row, AND
- a `cr664_workspaceentitlementses` row pointing at a new
  `cr664_platformworkspaces` named e.g. "Borrower Portal", AND
- a new workspace route + provider + deal-loader.

That entire chain is outside this repo's permission boundary.

### 1.3 Deal-route dispatch (today)

`DealRoute.tsx` recognizes three branches: banker / manager / team.
Executive + admin are explicitly denied. There is no borrower
branch. Adding one without the upstream identity work in §1.2
would render a borrower-shaped UI for an internal staff role,
which would be misleading.

### 1.4 Communication flows (today)

Three coexisting paths for banker → borrower communication, all
internal-initiated:

- **Phase 23: borrower update draft** — `LOCAL_ONLY_FLOWS.borrower-update-draft`.
  Banker generates a borrower-safe subject + body locally and copies
  to clipboard. **No Dataverse write. No timeline event.** The
  `BorrowerUpdateSent (788190014)` enum value exists in the timeline
  schema but is deliberately never emitted (Phase 23 guardrail —
  "do not claim a send unless we sent").
- **Phase 61: document-request Outlook send** — `GOVERNED_WRITES.deal-document-request-email`.
  DRY_RUN mode records audit + timeline as if a send happened;
  no actual network call. LIVE mode is a permanent-failure stub
  until the Office 365 Outlook connector is registered. See
  [PHASE_62](PHASE_62_OUTLOOK_LIVE_SEND.md).
- **Phase 63: document-request handoff** — `GOVERNED_WRITES.deal-document-request-handoff`.
  Banker opens mailto: in their own Outlook OR copies the email
  text; the app records the handoff with method + masked recipient.
  No connector, no Graph, no tenant-admin.

All three flows are **banker-initiated**. None of them give the
borrower visibility into the deal, return-channel
acknowledgments, or a place to upload anything.

### 1.5 Timeline visibility model (today)

`cr664_visibilityscope` values in the schema are
`BankerAndManager | Team | ExecutiveSafe | AdminOnly`. Every
governed write emits with `TIMELINE_VISIBILITY_BANKER_AND_MANAGER`
(788190000). A borrower-safe timeline projection would need a new
enum value AND a per-row decision about whether each event leaks
underwriting-sensitive context.

---

## 2. Capability matrix

Each row's classification follows the standing taxonomy:

- **Already feasible** — could ship today on the current schema +
  current code, without admin action.
- **Feasible with app-only work** — can ship without schema work or
  admin action, but requires new app code (and meets the standing
  governance rules).
- **Requires schema work** — needs new columns / tables / enum
  values in Dataverse, which then need to be regenerated into
  `src/generated/`.
- **Requires connector/admin work** — needs tenant-admin or
  connector registration; outside this repo's permission boundary.
- **Explicitly blocked** — combines two or more of the above AND a
  hard governance non-goal.

| # | Portal capability | Today's reality | Classification |
|---|---|---|---|
| 1 | **Authentication** — a borrower logging in and being recognized as themselves | No external identity. `runBootstrap` requires a `cr664_users` row keyed by the borrower's Bank-tenant Entra UPN; borrowers are not on the Bank's tenant. | **Requires connector/admin work** (tenant guest-user invitation flow) AND **Requires schema work** (entitlement chain for an external workspace role) |
| 2 | **Document visibility** — a borrower seeing their own document checklist | The schema CAN model it (cr664_DocumentChecklist already has the rows), but without §1 the borrower cannot be authenticated. Even read-only Dataverse access from outside the Bank tenant needs admin-side row-level security or a public-facing read service. | **Requires connector/admin work** (no public read path exists) |
| 3 | **Upload** — borrower drops a PDF into a checklist row | No File column on `cr664_DocumentChecklist`. The Phase 51 brief and `NOT_WIRED.document-upload` already pin this as schema-blocked. | **Explicitly blocked** (schema + governance non-goal) |
| 4 | **Messaging** — secure two-way comments between banker and borrower | No `SecureMessages` / `Comments` / `Conversations` entity. No way to attribute a message to a borrower actor (audit `cr664_ActorUser` is a systemuser bind). | **Requires schema work** AND **Requires connector/admin work** |
| 5 | **Notifications** — borrower receives "your application moved to Underwriting" | DRY_RUN/LIVE/HANDOFF email exist (Phases 61–63). LIVE blocked until Outlook connector registered. HANDOFF is banker-initiated, not automated. | **Requires connector/admin work** (Outlook connector for automated send) OR **Requires schema work** (a borrower-visible portal with an in-app inbox) |
| 6 | **Timeline visibility** — borrower sees a curated activity stream | `cr664_visibilityscope` has no `BorrowerSafe` value. Every governed write today emits to `BankerAndManager`. A borrower-safe stream would need either a new enum value (schema work) OR a curated app-side projection layer. | **Requires schema work** (new enum value) OR **Feasible with app-only work** (read-only projection that filters the existing stream — but only if §1 + §2 are solved) |
| 7 | **Task visibility** — borrower sees borrower-actionable tasks | Tasks (`cr664_dealtask1s`) have no borrower-actionable flag. Tasks today are assignee=systemuser. | **Requires schema work** |
| 8 | **Status visibility** — borrower sees the deal stage / status | `cr664_loandeals.cr664_stagereferencename` and friends already render in the banker workspace. Could be projected to a borrower view IF the borrower had a way in. | Borrower-safe SUBSET already exists in `borrowerUpdateDraft.ts` template logic (Phase 23). Render layer is **Feasible with app-only work**; identity layer is **Requires connector/admin work** |
| 9 | **Review visibility** — borrower sees "Personal Financial Statement: Reviewed" | `cr664_DocumentChecklist.cr664_reviewer` is a free-text string set by the Phase-55 governed write. Same shape as §8 — data exists, visibility model doesn't. | Same as §8 (split by layer) |
| 10 | **Auditability** — borrower actions hit the audit ledger | Audit `cr664_entitytype` has no `Borrower` value; `cr664_ActorUser` binds only to systemuser. A borrower action cannot today be honestly recorded as a borrower-actor event. | **Requires schema work** (new entity-type enum value AND a new actor binding column, or a documented convention that records borrower actions as systemuser=service-account with the borrower id in `cr664_notes`) |

---

## 3. Hard blockers — explicit confirmation

The phase brief asked for explicit confirmation of six potential
blockers. Audited findings:

| Suspected blocker | Confirmed? | Evidence |
|---|---|---|
| No File column on `cr664_DocumentChecklist` | **YES — confirmed blocker** | `Cr664_documentchecklistsModel.ts` lines 23–41; `NOT_WIRED.document-upload` reason text already states this. The `cr664_uploadstatus` boolean is metadata, not a binary. |
| No external auth provider | **YES — confirmed blocker** | `runBootstrap()` requires a `cr664_users` row keyed by Bank-tenant Entra UPN. No external/B2C/Auth0/magic-link auth path exists. |
| No invitation-token table | **YES — confirmed blocker** | `ls src/generated/services` shows no `Invitation*`, `Token*`, `MagicLink*`, `OneTime*`, or `Consent*` service. The schema does not model invitations at all. |
| No secure-message persistence | **YES — confirmed blocker** | No `Messages`, `Conversations`, `Comments`, `Threads` service. The closest is `cr664_DealTimelineEvent` (banker-and-manager scope only) and the `cr664_AuditEvent.cr664_notes` field (privileged ledger, not user-facing). |
| No external-user role model | **YES — confirmed blocker** | `workspaceRoutes.ts` recognizes exactly five role regexes; none match borrower / external / portal / guest. The `cr664_workspaceentitlementses` table presumably could in principle hold an "external" entitlement, but no such row exists in the bootstrap chain and no UI in this repo addresses one. |
| No connector-backed email delivery | **YES — confirmed blocker for borrower notifications** | The Office 365 Outlook connector is unregistered for this Code App ([PHASE_62](PHASE_62_OUTLOOK_LIVE_SEND.md)). HANDOFF mode (Phase 63) is banker-initiated only — not a notification surface. |

All six are confirmed standing blockers. The Phase 63 HANDOFF
governed write is the only "borrower-adjacent" capability the app
can perform without the Office 365 connector, and it remains a
banker-initiated send-from-Outlook — not a portal.

---

## 4. The smallest truthful MVP

Given §1–§3, no MVP that includes any of {authentication, upload,
messaging, automated notifications, in-app inbox} can ship without
upstream work. The largest honest gap is between "the app has the
data" and "a borrower can see it."

Three potentially shippable slices were considered:

### Option A — "borrower-safe one-page PDF" (banker-initiated)

The banker generates a borrower-safe one-page PDF summary of the
deal (current stage, outstanding documents, what's been received,
target close date) and downloads it locally. No Dataverse write.
No portal. The banker emails the PDF via Outlook (Phase 63 handoff)
or attaches it manually.

- **Authentication:** N/A — there is no portal.
- **Upload:** N/A — borrower still emails docs back via the banker.
- **Schema impact:** none.
- **Governance impact:** new `LOCAL_ONLY_FLOWS` entry; possibly a
  new `LOCAL_ONLY_FLOWS.borrower-status-pdf` row.
- **Honest framing:** "A borrower-safe PDF the banker shares
  manually." Does NOT claim any portal exists.
- **Microsoft Vibe alignment:** weakly advances "borrower visibility"
  by giving the banker a one-click artifact to share.

This is feasible today. It is also fundamentally NOT a portal — it
is a richer Phase 23 draft.

### Option B — "borrower acknowledgment via email handoff" (banker-initiated)

Extend Phase 63's handoff modal with a borrower-acknowledgment
flow: the banker prepares a "please confirm receipt" email through
the existing mailto/clipboard path. The audit row records that an
acknowledgment was REQUESTED. The borrower confirms by replying
manually; the banker manually records the reply via a Phase-22
note. No portal.

- **Authentication:** N/A.
- **Schema impact:** could ship as a Phase 63-style variant; no new
  columns required.
- **Governance impact:** a new `GOVERNED_WRITES` entry would be
  needed if the audit row carries new semantics. Otherwise can
  reuse the Phase 63 write with a different subject template.
- **Honest framing:** "Banker asked borrower to confirm — banker
  records the reply." Still NOT a portal.
- **Microsoft Vibe alignment:** weakly advances "status transparency"
  via a documented round-trip. The round-trip lives in the
  banker's Outlook, not in the app.

### Option C — "no portal yet; document the blockers and ship nothing"

Recommend deferring portal work entirely until upstream identity +
connector + schema decisions are made. Phase 64 IS this deferral.
The deliverable is this audit doc; the recommendation is for Phase
65 to NOT be a portal phase.

- **Authentication:** N/A.
- **Schema impact:** none.
- **Governance impact:** add a `NOT_WIRED.borrower-portal` entry in
  a future phase to give the deferral a concrete inventory row —
  but DO NOT add it in this phase (this is an audit, not an
  inventory-modification phase). Phase 65 can add the
  `NOT_WIRED.borrower-portal` row if it ratifies the deferral.
- **Microsoft Vibe alignment:** does not advance the spec, but
  prevents shipping a misleading "portal" that's actually a
  banker-only artifact generator.

### Recommendation: Option C, with Option A available as a fallback

The Microsoft Vibe scope assumes a borrower portal exists. It does
not. Pretending otherwise would either (a) ship a banker tool
labelled as a borrower portal, or (b) require schema + connector +
tenant work that this repo cannot perform.

Option A is honestly small and shippable, but it's a PDF
generator — calling it a "portal MVP" would be inaccurate. If the
team genuinely wants a banker-facing PDF generator, ship it under
its own name (e.g. "Phase 65: Borrower-Safe Status PDF"), not as
"borrower portal phase 1."

---

## 5. What this phase explicitly does NOT do

Per the brief's "Not allowed" list:

- ❌ No auth implementation.
- ❌ No fake login flow.
- ❌ No magic-link table or generation.
- ❌ No upload component, hidden or visible.
- ❌ No external-user permissions.
- ❌ No Teams guest access.
- ❌ No borrower UI routes (`/borrower/*` or otherwise).
- ❌ No portal branding (logo / palette / wordmark).
- ❌ No speculative architecture diagrams disconnected from current
  schema reality. The §1 audit is the ONLY architectural surface
  this phase produces.

Standing inventory rows are unchanged:
- `GOVERNED_WRITES`: 10 entries (Phase 63 added the last one).
- `NOT_WIRED`: unchanged. **Note**: this phase does NOT add a
  `borrower-portal` row. That belongs to Phase 65 if/when the
  team ratifies the deferral.
- `DELIBERATELY_BLOCKED`: unchanged.
- `LOCAL_ONLY_FLOWS`: unchanged.
- `WORKSPACE_DEAL_ACCESS`: unchanged.

---

## 6. Recommended Phase 65

**Recommendation: Phase 65 is NOT a portal phase.**

The four candidates ranked by honesty and operational value:

1. **(Recommended) Phase 65 — Borrower Portal Deferral Ratification + NOT_WIRED row.**
   - Add a single `NOT_WIRED.borrower-portal` entry that names this
     audit doc by path, summarizes the six confirmed blockers, and
     explicitly states "no borrower portal exists; banker-initiated
     handoff is the operational substitute (Phase 63)."
   - Add the negative-capability regression test pinning the entry.
   - Posture: `metadata-only`.
   - Production code changed: zero.
   - This is the **smallest honest follow-up** that converts this
     audit's findings into a permanent governance record.

2. **(Alternative) Phase 65 — Borrower-Safe Status PDF (banker-initiated).**
   - Pure-app, Option A from §4. Generate a one-page borrower-safe
     summary; download locally; banker shares via existing Phase 63
     handoff. New `LOCAL_ONLY_FLOWS.borrower-status-pdf` entry. No
     portal claim. No schema work.
   - Take this path **only if** the team wants a tangible
     borrower-facing artifact AND is willing to ship it as a
     LOCAL_ONLY_FLOWS row, not as a portal.

3. **(Defer) Borrower portal real implementation.**
   - Requires, in order: tenant guest-user invitation pattern;
     external workspace role + bootstrap matcher; new entitlement
     chain; File column on `cr664_DocumentChecklist`; visibility
     enum value `BorrowerSafe` on `cr664_DealTimelineEvent`; new
     `cr664_AuditEvent.cr664_entitytype` value `Borrower` (or a
     convention to attribute borrower actions to a service account);
     a secure-message entity (or a documented decision NOT to ship
     in-app messaging). All upstream.
   - This is a **multi-quarter cross-team initiative**, not a
     single phase.

4. **(Wait) Outlook connector unblock first.**
   - Phase 62's §2 swap remains the highest-leverage upstream
     change. Until LIVE-mode email send works end-to-end, even a
     banker-initiated portal slice would be hamstrung on
     notifications. If the team has bandwidth to push only one
     upstream item, push the connector registration first; revisit
     this portal audit after the connector lands.

**The default choice is Option 1 (Deferral Ratification).** It
converts the verbal "not until the schema work lands" stance into a
governance row + regression test, and prevents future phases from
quietly trying to ship a half-portal.

---

## 7. Findings summary (for cross-reference)

| Finding | Surface |
|---|---|
| `cr664_borrowers` has no contact info | `Cr664_borrowersModel.ts` |
| `cr664_DocumentChecklist` has no File column | `Cr664_documentchecklistsModel.ts`; `NOT_WIRED.document-upload` |
| Timeline visibility has no `BorrowerSafe` value | `Cr664_dealtimelineeventsModel.ts` |
| Audit entity-type enum has no `Borrower` value | `Cr664_auditeventsModel.ts` |
| Audit actor binds only to systemuser | `Cr664_auditeventsModel.ts` |
| No external-user / invitation / magic-link table | `ls src/generated/services` |
| No external workspace role | `workspaceRoutes.ts` |
| `cr664_dealtask1s` has no borrower-visible flag | `Cr664_dealtask1sModel.ts` (verified by absence) |
| `BorrowerUpdateSent` timeline event type EXISTS but is never emitted | `Cr664_dealtimelineeventsModel.ts` + `LOCAL_ONLY_FLOWS.borrower-update-draft` |
| Three banker-initiated email pathways shipped (Phases 23 / 61 / 63) | `LOCAL_ONLY_FLOWS`, `GOVERNED_WRITES` |
| Office 365 Outlook connector still unregistered | `outlookLiveStubPin.test.ts` + `NOT_WIRED.outlook-connector-live-send` |

---

## 8. Phase 64 AAR

**Files created**
- [docs/PHASE_64_BORROWER_PORTAL_AUDIT.md](PHASE_64_BORROWER_PORTAL_AUDIT.md) — this document. The only deliverable.

**Files modified**
- None.

**Borrower capabilities audited**
- 10 capability rows × 6 blocker checks; results in §2 and §3.

**Blockers identified**
- 6 confirmed hard blockers — File column; external auth; invitation
  token; secure-message persistence; external-user role model;
  connector-backed email. All cited in §3 against generated-model
  evidence.

**Feasible MVP identified**
- A genuine borrower portal: **not feasible today**.
- A banker-facing borrower-safe PDF generator (§4 Option A): feasible
  but should not be marketed as a portal.

**Recommended Phase 65**
- **Phase 65 — Borrower Portal Deferral Ratification + `NOT_WIRED.borrower-portal` entry.** Metadata-only. Converts this audit into a permanent governance record + a regression test that pins the deferral. See §6.

**Confirmations**
- Production behavior unchanged — no `.ts` / `.tsx` file modified.
- No canonical source duplicated.
- No blocked capability was enabled.
- No new governed write.
- No inventory drift — `GOVERNED_WRITES`, `NOT_WIRED`, `DELIBERATELY_BLOCKED`, `LOCAL_ONLY_FLOWS`, `WORKSPACE_DEAL_ACCESS`, `EXEC_TRANSITIONAL_FALLBACK_FEATURES`, `REFERENCE_DATA_GOVERNED` all unchanged.
- All 955 tests still pass (audit phase did not run them; nothing changed).
- `npm run build` not re-run (no source change).

**Newly discovered inconsistencies** (one line each; do not fix in this phase)
- `cr664_DealTimelineEvent.cr664_eventtype` carries `BorrowerUpdateSent (788190014)` but the inventory's `LOCAL_ONLY_FLOWS.borrower-update-draft` row explicitly states it is never emitted. The enum value is dead code in practice. If the team adopts Option 1 for Phase 65, the deferral row could also reference this dead value as evidence of an existing-but-deliberately-unused borrower surface.
- `cr664_loandeals.cr664_Client@odata.bind` exists but the dealQueries mapper does not surface it as part of `DealDetail`. A borrower-portal slice would have needed this; absent it, the deal-to-borrower link is currently inferred only via free-text `cr664_clientname`.
