# PR B — Deployment and Live Certification: Index and Sequencer

## Purpose and honesty statement

This is the deployment and live-certification package for the post-PR143 production remediation
arc (PR132–PR141, PR142, PR A/#143). **It does not duplicate the extensive, already-authoritative
deployment/rollback/evidence infrastructure this codebase already has** — it points to that
infrastructure directly where it's still current, and supplies only what's genuinely new or
missing for this specific remediation arc.

**Nothing in this package, or anywhere in this repository or session, claims any of the following
has actually happened**: a schema migration applied to a live environment, code deployed to a
running instance, or a live two-user test executed. Every "GO" in the final decision document is
conditioned on evidence that does not yet exist. This package tells an operator exactly how to
produce that evidence — it does not fabricate it.

## What already exists — follow these directly, do not re-derive

| Document | What it covers | Still current? |
|---|---|---|
| `docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md` | Top-level release sequencer: plugin build/register, feature flags, `pac code push` deployment, connector verification, live certification | Yes — the deployment command and plugin steps below are copied directly from it |
| `dataverse-plugins/CommercialLendingLOS.Plugins/PLUGIN_DEPLOYMENT.md` | Full plugin build/test/register procedure | Yes |
| `docs/operator-runbooks/DATAVERSE_GOVERNANCE_PLUGIN_DEPLOYMENT.md` | `LoanDealGovernedTransitionPlugin` registration specifics + bypass smoke test | Yes |
| `docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md` | Phased plugin/reason-field rollout + full rollback table | Yes |
| `docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md` | Complete 21-step SharePoint connector activation runbook | Yes — this is the SharePoint deliverable; follow it directly |
| `docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md` | Banker credit-authority field provisioning + seeding | Yes |
| `docs/E2E_CERTIFICATION_TEST_SCRIPT_2026-07-21.md`, `docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` | The base end-to-end certification script | Yes — `06_CONTROLLED_E2E_PRODUCTION_TEST_SCRIPT.md` in this package only adds what's new since then |
| `src/access/finalLaunchSmokeEvidence.ts`, `docs/operator-evidence/final-launch/` | Strict, code-validated evidence harness for 5 existing capabilities (crmLivePersistence, portfolioBoarding, documentChecklist, stageAdvancement, borrowerSend) | Yes, but scoped to those 5 capabilities only — does not cover this arc's new items without a code change |

## What this package adds (genuinely new, confirmed missing by direct investigation)

| Document | What it covers | Why it's new |
|---|---|---|
| `01_MIGRATION_RUNBOOK.md` | Exact commands for the 4 schema migrations this remediation arc introduced (N-01/16, N-22/23, N-17, closing-document persistence) | These migrations didn't exist before this arc |
| `02_SCHEMA_VERIFICATION_AND_DEPLOYMENT_COMMANDS.md` | A verify-everything sweep across old + new schema, plus the exact `pac code push` deployment command | Consolidates so an operator doesn't have to cross-reference 6 documents mid-deployment |
| `03_TWO_USER_TEST_REQUIREMENTS.md` | Live two-user segregation-of-duties / dual-control test procedure | **Confirmed by direct repo-wide search: no such script exists anywhere.** Every existing mention (PR107/PR111 funding docs, the adversarial audit) explicitly states a live two-person test has never been performed and cannot be simulated in a single operator session. This is written fresh to fill that gap. |
| `04_SECURITY_PRIVILEGE_REQUIREMENTS.md` | Consolidated role/privilege table for this arc's migrations + a documented segregation-of-duties enforcement gap | New content specific to this arc's findings |
| `05_EVIDENCE_TEMPLATES.md` | Lightweight, docs-only evidence templates for this arc's new items | The existing strict harness (`finalLaunchSmokeEvidence.ts`) is scoped to 5 fixed capabilities via a TypeScript enum — extending it to cover this arc's new items would be a code change, out of scope for a docs-only PR. This package's templates follow the same philosophy (never fabricate a pass) without requiring that code change. |
| `06_CONTROLLED_E2E_PRODUCTION_TEST_SCRIPT.md` | What to add to the existing E2E script for this arc's specific findings | Additive only — references the base script, does not replace it |
| `07_ADVERSARIAL_RETEST_REPORT.md` | Template for re-running an adversarial bypass check after deployment | New — no prior adversarial retest covered this arc's specific fixes |
| `08_GO_NO_GO_DECISION.md` | The final decision record | Synthesizes everything above; must be filled in by whoever actually executes this runbook — this package delivers the template and the current (all-blank-until-executed) state, not a completed decision |

## Recommended sequence

1. Read `04_SECURITY_PRIVILEGE_REQUIREMENTS.md` — confirm the operator executing this has the
   right role, and provision the two test personas needed for step 5.
2. Execute `01_MIGRATION_RUNBOOK.md` (all 4 migrations, any order) and
   `02_SCHEMA_VERIFICATION_AND_DEPLOYMENT_COMMANDS.md`'s verify sweep.
3. Follow `docs/governance/LAUNCH_DEPLOYMENT_RUNBOOK_2026-07-22.md`'s existing Steps 2–5 (plugin,
   feature flags, `pac code push`, connector verification including SharePoint via
   `docs/PHASE_264_SHAREPOINT_DOCUMENT_STORAGE.md`) — this package does not repeat those steps.
4. Execute `06_CONTROLLED_E2E_PRODUCTION_TEST_SCRIPT.md`'s additions on top of the existing base
   E2E script.
5. Execute `03_TWO_USER_TEST_REQUIREMENTS.md` live, with two genuinely distinct test personas.
6. Record every result using `05_EVIDENCE_TEMPLATES.md`'s templates.
7. Run `07_ADVERSARIAL_RETEST_REPORT.md`'s checks against the now-live environment.
8. Fill in `08_GO_NO_GO_DECISION.md` based on the actual evidence collected in steps 2–7 — not
   before.
