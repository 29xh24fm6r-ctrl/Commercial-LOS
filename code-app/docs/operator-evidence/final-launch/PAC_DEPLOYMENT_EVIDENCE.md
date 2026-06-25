# Phase 256B — Governed `pac code push` deployment evidence

**The OGB Commercial Lending CRM + LOS platform is LIVE in production.**

## Deployment

- **Command:** `pac code push`
- **Result:** `App pushed successfully.`
- **Connected as:** mpaller@oldglorybank.com
- **Environment:** Matthew Paller's Environment
  - Org URL: https://org3a57b8d4.crm.dynamics.com/
  - Org ID: d8c72df0-fd13-f111-afbe-000d3a34432b
  - Environment ID: 5f2d77a5-de50-edeb-9d74-5b2400a2320d
- **App play URL:** https://apps.powerapps.com/play/e/5f2d77a5-de50-edeb-9d74-5b2400a2320d/app/63858e09-3d0b-47c9-b1d2-65cef742fda4
- **Deployed commit:** `5ff16b2` (Phase 256B full live activation)
- **Date:** 2026-06-25

## Preconditions satisfied before the push (governed)

- enabledCount = **6 / 6**; fullLaunchAchieved = **true**; deploymentAllowed = **true**.
- CRM hydrated **true**; portfolio hydrated **true** (real token-backed full schema).
- All five final-launch smoke artifacts validated **GO** (passed + live + readback + rollback;
  delivery/audit for borrower send) via the operator smoke registry.
- Full test suite green (656 files / 10220 tests); `npx tsc -b` exit 0; `npm run build` green.
- Change committed and pushed to `origin/master` BEFORE the push.

## Gates live in production

`CRM_LIVE_PERSISTENCE_ENABLED`, `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` (+ route),
`DOCUMENT_CHECKLIST_GENERATION_ENABLED` (+ `CHECKLIST_WRITE_ENABLED`),
`BORROWER_MESSAGING_ENABLED` (+ `BORROWER_EMAIL_TRANSPORT_ENABLED`),
`AUTO_STAGE_ADVANCE_ENABLED`, plus New Deal create (pilot). Runtime live writes still
additionally require an authorized operator + injected transport + hydrated verified state.

## Rollback controls (one-line each)

- CRM: set `CRM_LIVE_PERSISTENCE_ENABLED` false.
- Portfolio: set `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + route false.
- Checklist: set `DOCUMENT_CHECKLIST_GENERATION_ENABLED` / `CHECKLIST_WRITE_ENABLED` false.
- Borrower send: set `BORROWER_MESSAGING_ENABLED` + `BORROWER_EMAIL_TRANSPORT_ENABLED` false; deploy `VITE_EMAIL_MODE=DRY_RUN`.
- Stage advancement: set `AUTO_STAGE_ADVANCE_ENABLED` false.

Then re-run `pac code push` to redeploy the gated build.
