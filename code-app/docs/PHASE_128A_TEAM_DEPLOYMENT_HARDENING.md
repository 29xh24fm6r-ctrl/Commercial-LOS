# Phase 128A — Team deployment hardening and launch checklist

## 1. Posture at this checkpoint

The four user-facing workspace surfaces are now built, reachable, and
shell-consistent:

- **Banker Workspace** — `/workspaces/banker` (BankerShell → LendingOSLayout)
- **Manager Command Center** — `/workspaces/manager` (LendingOSLayout)
- **Portfolio Command Center** — `/workspaces/manager?surface=portfolio` (same route, surface query swap)
- **Team Ops Queue** — `/workspaces/team` (LendingOSLayout, Phase 127C)

Phase 128A hardens the four surfaces for team deployment. No new
feature screens, no Dataverse schema change, no new write surface, no
redesign.

What changed in this phase:

1. **Deterministic date pin on `DealAutopilotPanel.test.tsx`** — the
   six pre-existing date-dependent failures are eliminated by pinning
   `vi.useFakeTimers({ now: NOW, toFake: ['Date'] })` to the fixture
   horizon (2026-05-18). Production code (`DealAutopilotPanel.tsx:109`
   uses `new Date()`) sees the same wall clock the fixture iso
   timestamps derive from. Small + safe + deterministic.
2. **Launch-readiness governance sweep** —
   `src/shared/governance/phase128ATeamLaunchReadiness.test.ts` adds
   30 cross-cutting static-source pins (§1 switcher, §2 shell, §3
   empty/failed/loading honesty, §4 no-fake-data, §5 read-only, §6
   Portfolio as query surface, §7 Team entitlement source).
3. **This deployment runbook.**

No production behavior change. The runtime posture going into
deployment is identical to the end of Phase 127C; this phase only
prevents regression and documents the operator handoff.

## 2. Deployment command sequence

Pre-deploy from `code-app/`:

```bash
# Sanity check — clean build + green tests + lint.
npm run lint
npm test
npm run build
```

Deploy to the live environment (canonical Phase 116 command):

```bash
# Confirm the right environment is active.
pac auth list
pac auth select --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d

# Ship the bundle.
pac code push \
  --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d \
  --solutionName CommercialLendingLOS
```

App identity (do not edit unless intentionally re-provisioning):

- `appId`: `63858e09-3d0b-47c9-b1d2-65cef742fda4`
- `appDisplayName`: `Commercial Lending LOS (Rebuild)`
- `environmentId`: `5f2d77a5-de50-edeb-9d74-5b2400a2320d`

(values match [power.config.json](../power.config.json))

## 3. Workspace demo walkthrough

For a manager-entitled signed-in user (the canonical demo audience):

1. **Land on the Banker Workspace.** Sign in. Bootstrap resolves to
   the user's primary route. The dark Lending OS sidebar appears on
   the left with the brand block (Lending OS / Old Glory Bank), the
   workspace switcher, the My Pipeline / Work Queue / Relationships
   / Resources nav rails, and the signed-in identity card.
2. **Open the workspace switcher.** Confirm the four entries:
   Banker (current), Team, Manager, Portfolio.
3. **Switch to Team Workspace.** Confirm the same dark sidebar
   persists. The Team Ops Queue cockpit renders first inside the
   shell: 10-tile command ribbon, 8 lanes, banker workload matrix,
   execution board (top 20), analytics row.
4. **Verify honest data in the queue.**
   - Banker names are human-readable (never raw GUIDs).
   - Execution board rows show `[Title link]  [Item-kind chip]
     [severity dot]` with `Client · Stage · Status · Banker · Urgency
     · Reason` below.
   - Missing fields render as `'Not set'` / `'Stage not set'` /
     `'Status not set'` / `'Unknown banker'` / `'Unassigned'` — never
     `'TBD'` / `'N/A'` / GUIDs.
5. **Switch to Manager Workspace.** Same dark sidebar, Manager
   Bloomberg Control Panel up top, nine existing manager cards below.
6. **Switch to Portfolio Workspace.** Same route + `?surface=portfolio`
   query. The cockpit body swaps to PortfolioCommandCenter; the
   sidebar, identity card, header chrome stay in place.
7. **Drill-down.** Click any deal link on the team execution board.
   Confirm navigation to `/deals/<id>` lands on the per-deal cockpit.
8. **Direct unauthorized URL test.** As a banker-only user (no
   manager probe entitlement), type `/workspaces/team` or
   `/workspaces/manager` in the address bar. WorkspaceGate bounces
   honestly to the bootstrap-primary route. No leak.

## 4. Required Dataverse seed / config rows

The four user-facing surfaces share the Phase 115 / 116 seed
contract. The minimum operator checklist for a fresh environment:

- **`cr664_platformuser`** — one row per real banker, populated
  `cr664_email` (must match the user's Entra UPN), populated
  `cr664_primaryworkspace` lookup.
- **`cr664_platformworkspace`** — at minimum: `Banker Workspace`,
  `Manager Command Center`, `Team Workspace`, `Portfolio
  Management`. Names exactly as written here (Phase 116 alias map
  is case-insensitive but expects these strings).
- **`cr664_banker`** — one row per banker. For manager-entitled
  users, `cr664_team` (lookup to `cr664_team`) must be populated.
  The Phase 124C `loadManagerIdentity` probe requires both the
  banker row + the team FK; the Phase 127B widening to the team
  workspace uses the exact same condition.
- **`cr664_team`** — at minimum the canonical commercial-lending
  team the user is mapped to (Phase 116 canonical: `Capital
  Markets`).
- **`cr664_loandeal`** — at least one row scoped to the same
  `cr664_team` so the team-scoped queries (Phase 84) return data.
  Populate `cr664_clientname`, `cr664_stagereferencename`,
  `cr664_statusreferencename`, `cr664_assignedbankername`,
  `cr664_amount`, `cr664_targetclosedate` on each row so honest
  absence labels (`'Stage not set'` / `'Unknown banker'`) do not
  appear in the demo.

[Phase 121 operator seed checklist](PHASE_121_OPERATOR_SEED_CHECKLIST.md)
is the canonical operator-facing version of this list.

## 5. Known limitations going into deployment

These are intentional, documented, and acceptable for the first team
deployment. They are NOT blockers; they are gaps the next phase can
close.

1. **No write affordances on the team / portfolio surfaces.** All
   three command centers (Manager Bloomberg, Portfolio Command,
   Team Ops Queue) are read-only by design. Pinned by §5 of the
   Phase 128A governance sweep. The per-deal cockpit
   (`/deals/<id>`) retains its existing governed write surfaces
   (CompleteTaskModal, RequestDocumentModal, etc.) unchanged.
2. **No predictive language.** The cockpits do not surface weighted
   exposure / win rate / approval odds / AI-generated copy. The
   Phase 127A static-source pin blocks regression here.
3. **Lending OS nav rails are banker-coded.** On Manager / Portfolio
   / Team, `onNavSelect` is intentionally `undefined` — the sidebar
   placeholders (Dashboard / Active Deals / Tasks & Actions, etc.)
   render as disabled `<button>` items by design (parity with the
   Banker shell). The team / manager / portfolio surfaces do not
   yet implement role-aware nav rails.
4. **Portfolio is a query surface, not a separate route.** It
   shares `/workspaces/manager` and swaps in via
   `?surface=portfolio`. App.tsx does not register a separate
   portfolio route. Pinned by §6.
5. **Team entitlement is wired off the manager probe.** A user
   who is `cr664_banker` + has a populated `cr664_team` FK is
   manager-entitled and also team-entitled. Banker-only users see
   neither link. Future role provisioning (e.g. a separate
   `cr664_team_membership` schema) could decouple the two; today
   they share the same source by intent.
6. **No new Dataverse schema, no new loader, no data-scope widening.**
   Pinned across every Phase 127A / 127B / 127C / 128A test.
7. **DealAutopilotPanel was previously flaking on date drift.**
   Phase 128A pins the test clock; no production behavior change.
   If a future phase changes the autopilot's relative-time model,
   re-evaluate the fake-timer pin.

## 6. Rollback notes

Phase 128A introduces ZERO production code changes. The only
artifacts are:

- a test-clock pin in
  [src/deals/DealAutopilotPanel.test.tsx](../src/deals/DealAutopilotPanel.test.tsx)
- a new governance sweep at
  [src/shared/governance/phase128ATeamLaunchReadiness.test.ts](../src/shared/governance/phase128ATeamLaunchReadiness.test.ts)
- this document

Rolling Phase 128A back is `git revert` of the phase commit.
**No deployment side-effect** — the built `dist/` bundle is
byte-equivalent before and after Phase 128A (the test-clock fix lives
in a `.test.tsx`, which is not bundled; the governance sweep lives
in a `.test.ts`, also not bundled; the doc is not bundled).

Rolling back Phase 127A / 127B / 127C is a different operation; their
runbooks live in [PHASE_127A_TEAM_OPS_QUEUE.md](PHASE_127A_TEAM_OPS_QUEUE.md),
[PHASE_127B_TEAM_WORKSPACE_SWITCHER.md](PHASE_127B_TEAM_WORKSPACE_SWITCHER.md),
and [PHASE_127C_TEAM_WORKSPACE_SHELL_POLISH.md](PHASE_127C_TEAM_WORKSPACE_SHELL_POLISH.md).
Phase 127's three sub-phases stack cleanly; reverting 127C alone
leaves 127B's switcher entry in place but loses the shell; reverting
127B alone leaves the new `TeamOpsQueue` cockpit reachable only by
the team-bootstrap user.

## 7. Post-deploy validation checklist

Inside the live environment, with a manager-entitled signed-in user:

- [ ] `/workspaces/banker` renders the BankerShell with the dark
      Lending OS sidebar visible.
- [ ] `/workspaces/team` renders the same dark sidebar and the Team
      Ops Queue as the first cockpit.
- [ ] `/workspaces/manager` renders the Manager Bloomberg Control
      Panel as the first cockpit, with the existing nine manager
      cards below.
- [ ] `/workspaces/manager?surface=portfolio` renders the Portfolio
      Command Center cockpit; URL keeps the manager route.
- [ ] Workspace switcher (both sidebar dark + inline light surfaces)
      shows exactly four entries: Banker, Team, Manager, Portfolio.
      The current workspace is marked with `aria-current="page"`.
- [ ] Direct URL test with a banker-only user: typing
      `/workspaces/team` redirects honestly to the user's primary
      route. No content leak.
- [ ] Team Ops Queue rows show human banker names. Search the
      rendered DOM for any guid-shaped string under
      `[data-team-execution-item]` — expected zero hits.
- [ ] Execution board rows include `[data-team-execution-kind]` AND
      `[data-team-execution-severity]` attributes.
- [ ] Empty team (zero authorized deals): KPI ribbon does not render
      partial values; the cockpit displays "No authorized team
      records found." honestly.
- [ ] Failed slot (kill the network briefly): the cockpit fails closed
      with the explicit "failing closed" copy. KPIs do not render.
- [ ] Per-deal cockpit (`/deals/<id>`) drill-down works from any
      execution-board row.
- [ ] No `<button>` / `<form>` / `onClick` / `onSubmit` in the body
      of any command center (Team / Portfolio / Manager Bloomberg).
      The Lending OS sidebar's placeholder `<button disabled>` items
      are scoped to the shell and intentional.

## 8. Tests landed (32 new)

| File | Tests | Purpose |
|---|---|---|
| [src/deals/DealAutopilotPanel.test.tsx](../src/deals/DealAutopilotPanel.test.tsx) | +2 lifecycle hooks (no new test cases, but +6 previously-failing test cases now pass deterministically) | `vi.useFakeTimers({ now: NOW, toFake: ['Date'] })` in `beforeEach`; `vi.useRealTimers()` in `afterEach`. Pins the fixture horizon. |
| [src/shared/governance/phase128ATeamLaunchReadiness.test.ts](../src/shared/governance/phase128ATeamLaunchReadiness.test.ts) | 30 | §1 switcher catalog + isCurrent semantics; §2 LendingOS shell present on Banker / Manager / Team; Portfolio shares Manager's shell; §3 each cockpit carries loading/failure/empty branches; §4 no fake sample names in cockpit bodies / workspace shells; §5 cockpit bodies stay read-only; §6 Portfolio = query surface (no new route); §7 Team route shares manager entitlement source. |

Existing tests still green:
- Phase 124C entitlements + switcher + LendingOSLayout (23)
- Phase 124E + 126B + 126C manager + portfolio workspace (19)
- Phase 127A TeamOpsQueue snapshot + dashboard charts + cockpit (45)
- Phase 127B TeamWorkspace switcher + Gate + entitlements (18)
- Phase 127C polish (15)
- Phase 80 / 83 DealAutopilotPanel — was 10 green + 6 failing (date drift);
  now 16/16 deterministically green.

## 9. Acceptance

- [x] Workspace switcher audit complete (catalog order, isCurrent,
      unauthorized link suppression, direct URL bounce — all pinned).
- [x] Shell consistency audit complete (Banker / Manager / Team
      render LendingOSLayout; Portfolio shares Manager's shell
      instance).
- [x] Empty / failed / loading state coverage pinned across the
      three cockpits.
- [x] No-fake-data regression pinned across cockpit bodies +
      workspace shells.
- [x] Launch checklist document landed (this file).
- [x] DealAutopilotPanel date-dependent flakes fixed deterministically
      (6 → 0 failures).
- [x] Governance sweep landed (30 new pins covering switcher, shell,
      empty states, sample data, read-only posture, Portfolio query
      surface, Team entitlement source).
- [x] `npm run build` clean.
- [x] Full suite: 3559 / 3559 green.
