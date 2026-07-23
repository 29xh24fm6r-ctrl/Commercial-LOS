# Final Seven Workstreams — Operator Action Register

Every action below requires Matthew (`mpaller@oldglorybank.com`), live credentials, and/or a
business decision this sandbox cannot make. Ordered by dependency, not by workstream number.

## 1. Dataverse governance plugin registration (Workstream 1)

Follow `docs/operator-runbooks/DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md` exactly: build on your
machine, run the 41-test suite to confirm your toolchain reproduces this pass's green result,
confirm the two still-genuinely-unconfirmed live-metadata items (audit option-set integers,
`cr664_loanrequestprofile.cr664_deal` lookup target), register both plugin steps, run the 5-step
controlled bypass-attempt smoke test. **This closes D2's residual security-floor gap** — every
stage-transition gate is enforced 100% client-side until this is done.

## 2. Document checklist live evidence (Workstream 4)

Follow Runbook 2 in `docs/remediation/FINAL_PRODUCTION_COMPLETION_OPERATOR_RUNBOOKS_2026-07-22.md`.
Use `checklistWriteDependency.ts`'s `config.enabled` override (or a locally-built flag-enabled test
build) to generate against a `SYSTEM TEST -` deal, confirm the exact expected rows, rerun to prove
idempotency, capture the audit row. Decide separately whether/when to flip
`DOCUMENT_CHECKLIST_GENERATION_ENABLED` for real bankers — a distinct governed-cutover decision.

## 3. Deal purpose/term/ownership schema (Workstream 5, Phase 5B)

1. Confirm the real business maximum for loan term in months (this pass's 480-month default is a
   technical placeholder, not policy).
2. Run `scripts/dataverse/create-deal-purpose-term-ownership-fields.ps1` (dry-run, review, then
   `-Apply`).
3. Regenerate the SDK, wire the three fields into the New Deal / Deal Profile / underwriting
   surfaces, decide on INTAKE stage-exit requirement status.

## 4. Closing-document framework schema + integration (Workstream 6)

1. Decide on and authorize an additive schema for persisting generated closing documents (no table
   exists today — see `06_CLOSING_DOCUMENT_FRAMEWORK.md`'s proposed shape).
2. Decide which workspace/stage should surface `ClosingDocumentsPanel.tsx`.
3. **Before relying on generated output in any real closing**: have legal/compliance formally review
   the 5 pilot templates for this specific organization — this framework's "approved" flag means
   "included in the reviewed pilot set," not "counsel-approved for your bank."

## 5. Funding authorization framework schema + integration (Workstream 7)

1. Decide on and authorize the proposed `cr664_fundingauthorization` (+ `cr664_fundingexception`
   child) schema — see `07_FUNDING_AUTHORIZATION_FRAMEWORK.md`'s proposed shape.
2. Decide whether reaching `BOARDED` should require a confirmed `FUNDED` funding-authorization
   record (a product/policy decision, not made by this pass).
3. Confirm the dual-control threshold ($250,000 default in this pass) matches actual bank policy.

## 6. Route-flag / capability enablement decisions (carried over from the prior pass)

Financial spreading/cash-flow route, live committee decision flow route, and document-checklist
generation flag flips remain deliberate business/operator enablement decisions, not code defects —
still not made by this or the prior pass.

## 7. Deployment

`pac code push` from synchronized local `master` only, per
`docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md` and this document's own
`DEPLOYMENT_AND_ROLLBACK_PLAN.md` — never from a feature branch. Requires this PR to be reviewed and
merged first.

## 8. Post-deployment re-certification

Re-run `npm run verify:launch-evidence` and the live operator certification script
(`docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md`) against the deployed app once items 1–7
above are complete.
