# Phase 65 — Borrower Portal Deferral Ratification

**Standing posture:** No borrower-facing portal ships in this Code
App. The `NOT_WIRED.borrower-portal` entry in
[platformInventory.ts](../src/shared/governance/platformInventory.ts)
pins the deferral; the Phase 65 regression tests in
[platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts)
make sure no portal route, magic-link handler, external-user role,
or upload-portal component lands in the tree without a deliberate
flip of those tests.

This doc is the **standing rationale** for that deferral, the
**unblock checklist** for when the team is ready to take it on, and
the **explicit non-build list** for everything that must NOT ship
until the upstream work lands.

Related canonical sources:
- [PHASE_64_BORROWER_PORTAL_AUDIT.md](PHASE_64_BORROWER_PORTAL_AUDIT.md) — the audit this deferral is built on
- [platformInventory.ts](../src/shared/governance/platformInventory.ts) — `NOT_WIRED.borrower-portal`
- [platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — Phase 65 regression sweep
- [bootstrapFlow.ts](../src/bootstrap/bootstrapFlow.ts) — Bank-tenant Entra → systemuser chain
- [workspaceRoutes.ts](../src/bootstrap/workspaceRoutes.ts) — five internal workspace roles; no external role
- [PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md), [PHASE_62_OUTLOOK_LIVE_SEND.md](PHASE_62_OUTLOOK_LIVE_SEND.md), [PHASE_63_EMAIL_HANDOFF_FALLBACK.md](PHASE_63_EMAIL_HANDOFF_FALLBACK.md) — banker-initiated email pathways (none of which constitute a portal)

---

## 1. Why the portal is deferred

The Microsoft Vibe scope assumes borrower-facing workflows
(visibility into requested documents, communication, status
transparency, document delivery coordination). The Phase 64 audit
checked the platform end-to-end against that assumption and
confirmed six concurrent hard blockers, every one of which sits
outside this repo:

1. **No external auth provider.** `runBootstrap()` requires a Bank-
   tenant Entra UPN matched to a `cr664_users` row. Borrowers are
   not on the Bank tenant; admitting them would require either
   tenant guest invitations (admin action) or a separate
   external-auth provider (B2C, Auth0, etc.) — neither of which is
   wired.
2. **No invitation-token / magic-link table.**
   `src/generated/services/` contains no `Invitation*`, `Token*`,
   `MagicLink*`, `OneTime*`, or `Consent*` service. The schema
   does not model invitations at all.
3. **No external-user role model.** `workspaceRoutes.ts` recognizes
   five internal regexes (`banker | team | manager |
   executive|board | admin`). There is no entitlement chain for an
   external workspace and no UI in this repo addresses one.
4. **No File column on `cr664_DocumentChecklist`.** Same gap pinned
   by `NOT_WIRED.document-upload`. A borrower upload surface has
   nothing to upload to.
5. **No secure-message persistence.** No `Messages` /
   `Conversations` / `Comments` service, and
   `cr664_DealTimelineEvent.cr664_visibilityscope` has no
   `BorrowerSafe` enum value
   (`BankerAndManager | Team | ExecutiveSafe | AdminOnly` only).
6. **No connector-backed email delivery.** The Office 365 Outlook
   connector is unregistered for this Code App (see
   [PHASE_62](PHASE_62_OUTLOOK_LIVE_SEND.md)), so automated
   borrower notifications are not possible. The Phase 63 HANDOFF
   path is banker-initiated only — not a notification surface.

A portal that papered over any one of these would be misleading. A
portal that required all six to be solved is a multi-quarter
cross-team initiative. The honest classification is **NOT_WIRED**,
which is what Phase 65 ratifies.

---

## 2. What IS feasible today

The capabilities that **already exist** and partially address the
Vibe portal scope — all banker-initiated, none borrower-facing:

- **Phase 22 governed document request** (`deal-document-request`)
  — banker stamps `cr664_requestdate` + records audit/timeline.
- **Phase 51 governed mark-received** (`deal-document-receive`) —
  banker stamps `cr664_receiveddate`; no binary involved.
- **Phase 55 governed mark-reviewed** (`deal-document-review`) —
  banker stamps `cr664_reviewer`.
- **Phase 23 borrower-update draft** (`LOCAL_ONLY_FLOWS.borrower-update-draft`)
  — banker generates a borrower-safe subject + body and copies to
  clipboard. No Dataverse write.
- **Phase 61 document-request email send** (`deal-document-request-email`)
  — DRY_RUN mode validates locally; LIVE remains a permanent-
  failure stub until the Outlook connector registers.
- **Phase 63 document-request handoff** (`deal-document-request-handoff`)
  — banker drafts in-app, opens their own Outlook via `mailto:` or
  copies the email text to the clipboard; the audit + timeline
  rows record the handoff method.

The banker can keep the borrower informed end-to-end with these
tools. **No part of this set is the borrower's view of the deal.**

---

## 3. What is NOT feasible today

A genuine borrower portal — ANY surface where a borrower
authenticates, sees their own deal data, communicates back, or
uploads — cannot ship until the §1 blockers are resolved upstream.

Specifically, the team should NOT pretend it can ship:

- A `/borrower/*` route family (no auth path).
- A "magic link" or "invitation token" flow (no schema, no
  delivery channel).
- A borrower upload surface (no File column).
- An in-app message thread (no secure-message entity).
- A borrower-readable activity timeline (no `BorrowerSafe`
  visibility enum value).
- A "borrower confirmed receipt" button that writes a Dataverse
  row (no borrower actor in the audit ledger).
- Borrower-aware deal status notifications (no automated email
  send; the Outlook connector is unregistered).

The Phase 65 regression tests pin every one of these structurally
— a future commit cannot quietly land a `/borrower/` route, a
`magicLink.ts` module, an `UploadPortal.tsx`, etc., without
flipping a red CI signal.

---

## 4. Unblock checklist (when the team is ready)

Each item below is **outside this repo's permission boundary**.
The sequence is approximate; some items can run in parallel.

### Step 1 — Identity (largest item, upstream)
- [ ] Decide the external-identity model. Options: Entra External
      Identities (formerly B2C) tenant; per-borrower guest invites
      against the Bank's tenant; a fully separate auth provider
      (Auth0 / Okta) bridged in.
- [ ] If guest invites: an admin process must exist for issuing
      and rotating them. Document the process.
- [ ] If External Identities: stand up the tenant, define the
      sign-up flow, attach a custom user attribute that links to
      the Dataverse borrower id.
- [ ] Extend `runBootstrap` to recognize external identities (or
      ship a SEPARATE bootstrap for the external surface — likely
      cleaner).

### Step 2 — Schema (Dataverse / regenerate SDK)
- [ ] Add the borrower-identity column on `cr664_borrowers`
      (e.g. `cr664_externaluserprincipalname` and/or
      `cr664_externalobjectid`).
- [ ] Add a `BorrowerSafe` value to
      `cr664_DealTimelineEvent.cr664_visibilityscope`.
- [ ] Add a `Borrower` value to
      `cr664_AuditEvent.cr664_entitytype` (or document the
      convention that borrower actions write with a service-account
      `cr664_ActorUser` + borrower id in `cr664_notes`).
- [ ] Decide on a secure-message entity: either model it as
      `cr664_dealmessages` (Deal + EventBy + summary + visibility +
      direction), or repurpose existing timeline events with a
      `BorrowerSafe` scope. The simpler choice is usually the
      right one — pick one.
- [ ] Add the File column on `cr664_DocumentChecklist` (closes
      `NOT_WIRED.document-upload` simultaneously).
- [ ] Regenerate `src/generated/` and verify the new typed services
      compile.

### Step 3 — Invitation flow
- [ ] If using magic-link tokens (External Identities can handle
      this without a custom table; guest invites can't): decide
      whether the token lives in a new `cr664_invitations` table
      or in the external identity provider. Document the choice.
- [ ] Wire the banker-side invitation initiation as a governed
      write — `deal-borrower-invite` — that emits audit + timeline
      and triggers the actual invitation through the chosen
      provider.
- [ ] If using Outlook connector for the invite email, complete
      Phase 62 §2 swap first.

### Step 4 — Connector for borrower notifications
- [ ] Register the Office 365 Outlook connector (closes
      `NOT_WIRED.outlook-connector-live-send` and the Phase 62 swap
      target simultaneously). OR ship a Power Automate flow + a
      separate webhook governed write — the Code App side stays
      thin.

### Step 5 — Portal app surface
- [ ] **Separate Code App, not this one.** The internal LoanOps
      surface is sealed against external users by design (workspace
      isolation invariant); injecting a borrower role into this
      repo would dilute that. The borrower portal should be its own
      Code App that reads the same Dataverse via borrower-scoped
      queries.
- [ ] Borrower-scoped read predicate: `loadDealForBorrower(dealId,
      borrowerId)` that matches `cr664_loandeals._cr664_client_value`
      → `cr664_borrowers.cr664_borrowerid`.
- [ ] Borrower-safe DealDetail projection (separate from
      `DealDetail` in `dealQueries.ts`): omits relationship notes,
      collateral summary, policy exceptions, pricing margins, and
      anything else that's bank-internal.
- [ ] Read-only document checklist view scoped to outstanding +
      received + reviewed for this borrower's deal(s).
- [ ] Optional: bidirectional messaging surface (Step 2's
      secure-message entity).
- [ ] Optional: borrower upload (Step 2's File column).

### Step 6 — Inventory + tests
- [ ] In the separate portal Code App, replicate the
      `platformInventory` + governance sweep discipline (audit /
      timeline / outcome union / correlation id / conservative
      copy).
- [ ] In THIS repo, when the portal goes live, REMOVE
      `NOT_WIRED.borrower-portal` and the Phase 65 regression
      tests in the same commit that flips the deferral.

The shortest plausible path (skipping every "Optional"): identity +
schema regen + a single read-only "see your checklist" page in a
separate Code App, with no upload and no messaging. Even that is
a quarter+ of cross-team work.

---

## 5. What MUST NOT be built until unblocked

Any of the following landing in this repo (or a sibling repo
labelled as part of the same LoanOps app) WITHOUT the §4 work is
a governance regression:

- ❌ `/borrower/*` routes (or any `BorrowerPortal*` component) in
  this Code App.
- ❌ Fake login / magic-link / one-time-code handling.
- ❌ Mock or simulated auth for borrower users.
- ❌ Upload UI of any kind (the document-upload non-capability is
  ALREADY pinned separately by `NOT_WIRED.document-upload`).
- ❌ Secure-message UI / threaded comments / chat widget.
- ❌ A borrower role in `workspaceRoutes.ts` or
  `WORKSPACE_DEAL_ACCESS`.
- ❌ A new governed write that claims to record borrower-initiated
  action (no borrower actor exists in the audit ledger).
- ❌ Any banker-facing component labelled "portal" or "borrower
  view" that is actually just a banker preview — that is exactly
  the misleading framing the Phase 64 audit warned against. If the
  team wants a banker-shareable borrower-safe artifact, ship it
  with a precise name (e.g. "borrower-safe status PDF") and a
  `LOCAL_ONLY_FLOWS` row that says so.

The Phase 65 regression tests pin these structurally. Removing
them is a deliberate act that lifts the deferral.

---

## 6. Recommended next operational phase

**Recommendation: Phase 66 should NOT be a portal phase either.**
With the deferral now ratified in inventory + tests, the highest-
leverage upstream work is still:

1. **(Highest leverage) Office 365 Outlook connector registration**
   — closes the Phase 62 stub AND removes one of the six portal
   blockers in §1. One upstream action; two governance rows
   resolved.
2. **File column on `cr664_DocumentChecklist`** — closes
   `NOT_WIRED.document-upload` AND removes a second portal
   blocker.
3. **Stage progression schema** (`DELIBERATELY_BLOCKED.stage-progression-advance`) — independent of the portal, but a long-standing schema ask in `docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md`.

In-repo phases that are honest in the meantime:
- **Banker-safe stale-document escalation** — extend Phase 54
  pending-review signal into a Phase-21-style governed task
  reassignment write. Pure internal; no portal exposure.
- **Manager / team workspace polish** — operational read-only
  surfaces already exist; small UX improvements have no
  governance risk.
- **Release Readiness Gate refinements** — surface the new
  `NOT_WIRED.borrower-portal` row in the admin diagnostics panel
  so leadership has a single place to see the portal status.

The Phase 64 audit + Phase 65 deferral together convert "we
probably can't ship a portal yet" into a tested governance fact.
Future phase briefs should treat the borrower-portal posture as
load-bearing — flipping it requires the §4 upstream work, full
stop.

---

## 7. Phase 65 AAR

**Files created**
- [docs/PHASE_65_BORROWER_PORTAL_DEFERRAL.md](PHASE_65_BORROWER_PORTAL_DEFERRAL.md) — this document.

**Files modified**
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — added `NOT_WIRED.borrower-portal` entry citing all six blockers + the Phase 64 audit + this doc.
- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — added the Phase 65 describe block (deferral assertions) and the static-source sweep (no borrower route, no magic-link route, no upload-portal route, workspace roles unchanged).
- [docs/CANONICAL_SOURCES.md](CANONICAL_SOURCES.md) — added two rows pointing at the Phase 64 audit and this deferral doc.

**NOT_WIRED entry added**
- `borrower-portal` (Phase 65). Reason text names every one of the six confirmed blockers and references both the Phase 64 audit and this doc.

**Blockers pinned (in `NOT_WIRED.borrower-portal.reason`)**
- No external auth provider.
- No invitation-token / magic-link table.
- No external-user role model.
- No File column for uploads.
- No secure-message persistence.
- No connector-backed email delivery.

**Tests added/updated**
- `Phase 65 borrower portal deferral` — 8 assertions: entry exists in NOT_WIRED; not in GOVERNED_WRITES; not in LOCAL_ONLY_FLOWS; not in DELIBERATELY_BLOCKED; reason cites all six blockers + both doc paths; reason is concrete; both docs exist on disk.
- `Phase 65 static-source assertions (no portal code exists)` — 5 sweeps: forbidden borrower-portal path patterns; forbidden magic-link path patterns; forbidden upload-portal path patterns; `'borrower-portal'` literal restricted to `platformInventory.ts`; no import lines for magic-link / one-time-token / invitation-token modules; `workspaceRoutes.ts` still recognizes exactly the five internal roles; `WORKSPACE_DEAL_ACCESS` still names exactly the five internal roles.

**Confirmations**
- No borrower UI route added.
- No fake auth / token mock / magic-link handler added.
- No upload UI added.
- No secure-message UI added.
- No borrower role added to `workspaceRoutes.ts` or `WORKSPACE_DEAL_ACCESS`.
- No new governed write — `GOVERNED_WRITES` still at 10.
- No `DELIBERATELY_BLOCKED` row added (the borrower portal is **not** one schema decision away; it lives in `NOT_WIRED` per Phase 64's classification).
- Production behavior unchanged.

**Recommended next operational phase**
- Phase 66 should NOT be a portal phase. The highest-leverage upstream work is still the Office 365 Outlook connector registration (closes Phase 62 stub + one portal blocker) followed by a File column on `cr664_DocumentChecklist` (closes `NOT_WIRED.document-upload` + another portal blocker). In-repo phases that don't touch the portal — banker-side polish, governed-write extensions, admin diagnostics — are all honest options.
