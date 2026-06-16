# Phase 170N–170P — Governed New Deal create UI wired behind a disabled gate

## Summary

Wires the Phase 170M governed create adapter to an in-app admin surface that is
**visibly disabled and non-operational by default**, adds a fail-closed
controlled-enablement reader (170O), and proves every create/audit proof state
(170P) — all without creating any Dataverse record.

## Architecture (SDK-safe, fail-closed)

- `src/deals/newDealCreateEnablement.ts` (170O) — pure, fail-closed reader. It
  decides one of `disabled` / `enabled_nonprod_only` / `unauthorized` /
  `config_invalid` / `environment_not_allowed` / `resolver_not_ready` from
  injected config + environment + authorization + resolver readiness. Default
  is `disabled`. Production is blocked unless an explicit, test-pinned rollout
  approval AND production-approved references are present. It never reads env /
  secrets, never persists, and never changes the hard
  `NEW_DEAL_CREATE_ADAPTER_ENABLED = false` default.
- `src/deals/newDealCreateController.ts` (170N) — the guarded UI boundary.
  `getNewDealCreateViewState` is pure and imports the adapter as a TYPE only, so
  a rendering component never pulls the generated services / SDK.
  `submitGovernedNewDeal` re-checks the gate and refuses BEFORE constructing any
  live dep; only when the view-state is `ready` does it dynamically import the
  adapter and run it. A second hard floor — the public intake gate
  `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` — must also be true, so the surface is
  never `ready` this phase.
- `src/deals/NewDealCreatePanel.tsx` (170N) — renders the controller's
  view-state honestly; the submit control is disabled whenever the surface is
  not `ready` (always, in every committed config). Mounted inside the admin New
  Deal intake panel.

## Honest disabled copy

While disabled the surface states, per state: "New Deal creation is not enabled
in this environment. No record has been created." (and unauthorized /
environment / resolver / config variants). The submit button reads "Create deal
(not available)" and is disabled. The panel reports success only after a real
write and a successful audit; a created deal whose audit fails reports an
honest partial state, never a false success.

## Safety properties (pinned by tests)

- No Dataverse service call or audit write occurs while disabled (the controller
  never constructs live deps unless `ready`).
- The default config is `disabled`; malformed config fails closed to
  `config_invalid`; unknown env / non-admin / not-ready resolver each fail
  closed.
- No hardcoded Stage/Status GUIDs; binds come from the resolver.
- No bypass/suppress/force headers; no Graph/external HTTP; no CRM / portfolio /
  stage-advance / email / borrower writes in any New Deal create file.

## Governance posture

`new-deal-create` stays in `NOT_WIRED`, reason updated to **WIRED_DISABLED**:
the governed adapter now exists and is wired behind the controlled gate but is
disabled by default. Live create stays off pending production-approved
references and the Phase 170Q certified enablement decision. See
docs/PHASE_170Q_NEW_DEAL_CREATE_PRODUCTION_ENABLEMENT_CERTIFICATION.md.
