# Phase 68 — Release Readiness Gate Operational Capability Clarity

**Phase posture:** admin diagnostics display only. No new write, no
schema work, no production behavior change outside the
ReleaseReadinessGate render output. The readiness-status rollup
semantics are unchanged — the four-status enum
(`ready | needs-review | not-wired | blocked`) and the existing
eight category derivation are preserved exactly. Phase 68 adds a
**Capability Inventory** sub-section that surfaces the canonical
`platformInventory.ts` data in a stakeholder-readable grouping so
governed-write coverage, local-only flows, not-wired-by-blocker-
kind, and deliberately-blocked surfaces stay visually distinct.

Related canonical sources:
- [src/admin/ReleaseReadinessGate.tsx](../src/admin/ReleaseReadinessGate.tsx) — the gate + capability inventory render
- [src/shared/governance/releaseReadiness.ts](../src/shared/governance/releaseReadiness.ts) — unchanged readiness derivation
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — canonical data; new `NotWiredBlockerKind` classification + required `blockerKind` field on every NOT_WIRED entry
- [PHASE_30](RELEASE_NOTES_PHASES_1_40.md) — original Release Readiness Gate brief
- [PHASE_61_OUTLOOK_EMAIL_DELIVERY.md](PHASE_61_OUTLOOK_EMAIL_DELIVERY.md), [PHASE_62_OUTLOOK_LIVE_SEND.md](PHASE_62_OUTLOOK_LIVE_SEND.md), [PHASE_63_EMAIL_HANDOFF_FALLBACK.md](PHASE_63_EMAIL_HANDOFF_FALLBACK.md), [PHASE_64_BORROWER_PORTAL_AUDIT.md](PHASE_64_BORROWER_PORTAL_AUDIT.md), [PHASE_65_BORROWER_PORTAL_DEFERRAL.md](PHASE_65_BORROWER_PORTAL_DEFERRAL.md), [PHASE_66_BORROWER_SAFE_STATUS_PACKET.md](PHASE_66_BORROWER_SAFE_STATUS_PACKET.md), [PHASE_67_PACKET_EMAIL_HANDOFF.md](PHASE_67_PACKET_EMAIL_HANDOFF.md) — the seven phases this gate now surfaces honestly

---

## 1. Why this phase exists

Phases 61–67 introduced several no-admin / no-connector operational
workflows that, viewed individually in inventory, can be confused
with full connector-backed automation:

- Phase 61 split email delivery into DRY_RUN / LIVE modes (LIVE is
  a permanent-failure stub until the Outlook connector registers).
- Phase 63 added the HANDOFF email mode (banker-initiated, no
  app-side send).
- Phase 66 shipped a local-only borrower-safe status packet
  generator + modal.
- Phase 67 extended the modal with the Phase 63 handoff helpers so
  the banker can `mailto:` or clipboard-copy without leaving the
  packet preview.

The Release Readiness Gate at Phase 30 displayed readiness as eight
rolled-up categories, but it did **not** explicitly distinguish:
- governed (audit + timeline + correlation-id discipline)
- local-only (generates content; never writes Dataverse)
- not-wired-but-blocked-upstream (connector / schema / etc.)
- deliberately-blocked (governance decision; remains blocked even
  if technically feasible)

Phase 68 surfaces those four distinctions, plus a finer-grained
subdivision of the not-wired bucket by upstream-blocker kind, so
stakeholders cannot mistake a local-only handoff for live delivery
or a connector blocker for a schema blocker.

## 2. What changed

### 2.1 `NotWiredBlockerKind` (new metadata; canonical data unchanged)

[platformInventory.ts](../src/shared/governance/platformInventory.ts)
gains a small additive change:

- A new exported union `NotWiredBlockerKind` with five values:
  `connector | schema | governance | observability | compound`.
- A new required `blockerKind` field on `NotWiredEntry`.
- Every one of the 10 existing `NOT_WIRED` entries is tagged.

The reasons / labels / ids of every entry are byte-identical to
Phase 67. The tag is purely descriptive metadata — it categorizes
WHY each capability is not wired, so the Release Readiness Gate
can group them visually.

### 2.2 Capability Inventory render section (new UI inside the existing gate)

[ReleaseReadinessGate.tsx](../src/admin/ReleaseReadinessGate.tsx)
adds a new `<section aria-label="Capability inventory">` after the
existing eight-category list and before the card footer. It has
four subsections:

1. **Governed writes (N)** — count only, with a one-line discipline
   reminder ("Each shipped governed write follows the audit +
   timeline + correlation-id coordination discipline"). The
   per-write list intentionally stays in `platformInventory.ts` to
   keep the card lean. At Phase 68: `N === 10`.

2. **Local-only flows (N)** — every `LOCAL_ONLY_FLOWS` entry is
   rendered with its label, its note text, and a
   "Local-only · no Dataverse write" pin badge. At Phase 68 the
   three local-only flows surface:
   - `borrower-update-draft` (Phase 23)
   - `credit-memo-local-preview` (Phase 24)
   - `borrower-safe-status-packet` (Phase 66 + 67)

3. **Not wired (N)** — every `NOT_WIRED` entry is rendered, grouped
   by `blockerKind` in a fixed display order:

   | Display order | Group heading | Phase 68 count |
   |---|---|---|
   | 1 | Connector not registered (upstream blocked) | 1 |
   | 2 | Schema column missing (upstream blocked) | 3 |
   | 3 | Compound upstream blocker | 1 |
   | 4 | Governance non-goal / deferred design decision | 4 |
   | 5 | In-app observability not wired | 1 |

   Each entry under a group shows its label + the canonical reason
   text + a "Not wired" badge.

4. **Deliberately blocked (N)** — every `DELIBERATELY_BLOCKED`
   entry is rendered with its label + reason + (where present) the
   `enablementMapPath` pointer to a planning doc. Carries a
   "Deliberately blocked" badge. At Phase 68: 1 entry
   (`stage-progression-advance`).

### 2.3 Conservative-copy discipline (Phase 68 language)

The new section uses exactly the labels the Phase 68 brief
mandated:

- "handoff" — appears in the Phase 66 / 67 LOCAL_ONLY note for the
  borrower-safe status packet.
- "local-only" — the LOCAL_ONLY_FLOWS pin badge and the lead line.
- "not wired" — the NOT_WIRED pin badge and the group heading.
- "upstream blocked" — the connector / schema group headings.
- "connector not registered" — the connector-kind group heading.
- "schema column missing" — the schema-kind group heading.

And NEVER uses (pinned by tests):

- "sent"
- "delivered"
- "portal available"
- "upload available"
- "live email enabled"
- "production-ready"

The conservative-copy assertions scan `document.body.textContent`
at render time, so the ban applies to every label, every reason,
every badge, and every helper line.

## 3. What did NOT change

- **Readiness derivation semantics.** `deriveReleaseReadiness()` is
  unchanged. The eight readiness categories, the four-status enum,
  the sort order, and the overall rollup logic are byte-identical
  to Phase 30.
- **Overall badge result.** The "Not ready to promote / Review
  required / Cannot fully verify / Ready to promote" rollup is
  unchanged.
- **Platform inventory canonical data.** Every `NOT_WIRED` id,
  label, and reason is byte-identical to Phase 67. The new
  `blockerKind` field is additive metadata; it does not change what
  any entry means or claims.
- **`GOVERNED_WRITES`.** Still 10 entries. The Phase 68 brief
  explicitly forbids new governed writes; none were added.
- **`LOCAL_ONLY_FLOWS`.** Still 3 entries (Phase 66 / 67 left it
  at 3).
- **`DELIBERATELY_BLOCKED`.** Still 1 entry.
- **`NOT_WIRED.borrower-portal`.** Unchanged (still `compound`).
- **`NOT_WIRED.document-upload`.** Unchanged (still `schema`).
- **`NOT_WIRED.outlook-connector-live-send`.** Unchanged (still
  `connector`).
- **`workspaceRoutes.ts`.** Unchanged. The Phase 65 sweep that pins
  exactly five internal workspace roles still passes.

## 4. Tests added / updated

### `ReleaseReadinessGate.test.tsx`

- **Two existing tests scoped to the readiness list** via
  `within(screen.getByRole('list', { name: /release readiness
  categories/i }))` so the Phase 68 Capability Inventory section's
  presence doesn't cause `getByText` to throw on duplicate matches.
  This is a purely structural change; the test invariants are
  preserved.
- **New `Phase 68 capability inventory` describe block** — 9 new
  assertions:
  - The Capability inventory section renders with its lead line.
  - The governed-writes count surfaces (pinned to
    `GOVERNED_WRITES.length === 10`).
  - Every `LOCAL_ONLY_FLOWS` entry surfaces with the
    "Local-only · no Dataverse write" pin (count matches).
  - The Phase 66 / 67 borrower-safe status packet is explicitly
    present, and the Phase 67 in-modal handoff is referenced in
    the rendered note.
  - All five `NotWiredBlockerKind` group headings appear.
  - `borrower-portal` surfaces as `compound`.
  - `document-upload` surfaces as `schema`.
  - `outlook-connector-live-send` surfaces as `connector`.
  - Every `DELIBERATELY_BLOCKED` entry surfaces with reason text +
    the "Deliberately blocked" pin (count matches at least).
  - Cross-list invariants: no `LOCAL_ONLY_FLOWS` id appears in
    `GOVERNED_WRITES`; no `NOT_WIRED` id appears in
    `GOVERNED_WRITES`.
- **New `Phase 68 conservative-copy ban list` describe block** —
  4 assertions covering the brief's forbidden phrases
  (production-ready, live email enabled, email sent / delivered,
  portal available, upload available) AND the mandated phrases
  (handoff, local-only, not wired, upstream, connector not
  registered, schema column missing).

### `platformInventory.test.ts`

- **New `every not-wired entry carries a blockerKind from the
  closed union (Phase 68)`** — runtime check that every `NOT_WIRED`
  entry has one of the five allowed kinds (no escapes via `any` /
  `unknown`).
- **New `specific not-wired entries map to specific blockerKinds
  (Phase 68 anchor)`** — pins the classification of every existing
  entry. A future phase that reclassifies an entry must update
  this test deliberately.

The existing 970+ Phase-1..67 tests are unchanged.

## 5. Phase 68 AAR

**Files created**
- [docs/PHASE_68_RELEASE_READINESS_CAPABILITY_CLARITY.md](PHASE_68_RELEASE_READINESS_CAPABILITY_CLARITY.md) — this document.

**Files modified**
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — added `NotWiredBlockerKind` union; added required `blockerKind` field on `NotWiredEntry`; tagged every one of the 10 existing `NOT_WIRED` entries. No id / label / reason changed.
- [src/admin/ReleaseReadinessGate.tsx](../src/admin/ReleaseReadinessGate.tsx) — added the Capability Inventory section (governed-writes count, local-only flows list, NOT_WIRED grouped by blockerKind, DELIBERATELY_BLOCKED list); imports `DELIBERATELY_BLOCKED`, `LOCAL_ONLY_FLOWS`, `NOT_WIRED`, type `NotWiredBlockerKind` / `NotWiredEntry` / `LocalOnlyFlow` / `DeliberatelyBlockedEntry`; added `inventoryStyles`. The Phase 30 readiness derivation and the existing eight category-row UI are unchanged.
- [src/admin/ReleaseReadinessGate.test.tsx](../src/admin/ReleaseReadinessGate.test.tsx) — scoped two existing tests to the readiness list (`within` + `aria-label="Release readiness categories"`); added two new describe blocks (capability inventory assertions + Phase 68 conservative-copy ban list).
- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — added two assertions pinning the new `blockerKind` field (closed-union enforcement + per-entry classification anchor).

**Readiness categories surfaced**
- Phase 30 readiness rollup (8 categories) — unchanged.
- Phase 68 capability inventory groups: **governed writes** (count), **local-only flows** (3 entries listed), **not wired** grouped by blockerKind (5 sub-groups: connector / schema / compound / governance / observability), **deliberately blocked** (1 entry).

**Tests added / updated**
- 9 new capability-inventory assertions in `ReleaseReadinessGate.test.tsx`.
- 4 new conservative-copy ban-list assertions in `ReleaseReadinessGate.test.tsx`.
- 2 new blockerKind assertions in `platformInventory.test.ts`.
- 2 existing tests scoped to the readiness list (no semantic change).

**Confirmations**
- No new writes — `GOVERNED_WRITES.length === 10` (pinned).
- No live email enabled — the conservative-copy ban explicitly forbids "live email enabled" and the gate renders zero such claim.
- `NOT_WIRED.borrower-portal` remains (now classified `compound`).
- `NOT_WIRED.document-upload` remains (classified `schema`).
- `NOT_WIRED.outlook-connector-live-send` remains (classified `connector`).
- `NOT_WIRED.email-delivery` remains (classified `governance`).
- `NOT_WIRED.test-coverage-build-verification` remains (classified `observability`).
- `DELIBERATELY_BLOCKED.stage-progression-advance` remains unchanged.
- Phase 65 borrower-portal structural sweep still green.
- Phase 30 readiness derivation semantics unchanged — the readiness rollup result for a given AdminData input is byte-identical before and after Phase 68.
- Production behavior change is confined to the admin diagnostics card. No other surface renders differently.

**Recommended next phase**
- Phase 69 should not be a portal phase. The two highest-leverage upstream items remain:
  1. **Office 365 Outlook connector registration** (closes Phase 62 stub + `NOT_WIRED.outlook-connector-live-send` + part of the `compound` borrower-portal blocker stack — one upstream action, three governance rows resolved).
  2. **File column on `cr664_DocumentChecklist`** (closes `NOT_WIRED.document-upload` + part of the `compound` borrower-portal blocker stack).
- In-repo, three honest options that respect every standing deferral:
  - **Phase 69 — Stale Pending-Review Escalation** (originally floated in Phase 66/67): extend the Phase 54 pending-review signal into a Phase-21-style governed task reassignment write. Internal flow, no portal exposure, reuses the audit + timeline discipline. Becomes the 11th governed write.
  - **Phase 69 — Capability Inventory in `STABILIZATION_CHECKLIST.md`**: mirror the Phase 68 grouping into the standing checklist doc so external readers (not just admins inside the gate) can see the same structured picture. Pure docs.
  - **Phase 69 — Manager / Team workspace polish refresh**: small read-only UX improvements on the manager + team workspaces (which are at Phase 36 / 37 today). No governance risk; no new write.
