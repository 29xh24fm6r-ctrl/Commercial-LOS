# Threat / Bypass Model — Loan Deal Governance

**Companion to** `ADR_001_PLATFORM_ENFORCED_CREDIT_WORKFLOW_GOVERNANCE.md` and
`CANONICAL_TRANSITION_POLICY_CONTRACT.md`. Enumerates every write path that could set
`cr664_loandeals.cr664_stagereference` / `cr664_statusreference`, and states exactly what control
closes each one — or, where nothing closes it, says so plainly.

**Unifying fact this model relies on:** Dataverse routes every create/update/delete, regardless of
the calling tool, through the same internal message pipeline (`Update` for a field change). A
synchronous plugin registered on that message fires for all of them uniformly — there is no separate
code path per client to individually secure. This is *why* a single plugin closes so many rows in the
table below at once, rather than needing one control per tool.

| # | Vector | Description | Closed by | Residual risk |
|---|---|---|---|---|
| 1 | **Direct Web API call** (`PATCH /api/data/v9.x/cr664_loandeals(id)`) with a valid bearer token and ordinary table write access | The exact scenario the E2E audit's D1 finding demonstrated — any authenticated caller with write access, using `curl`/Postman/a script, can set any field directly. | Plugin at `Update`, stage 20, rejects before commit. | None once armed and the caller lacks a security-role bypass (see #9). |
| 2 | **Power Automate flow** performing an Update action on `cr664_loandeals` | A flow (built by anyone with maker access) that updates stage/status as a side effect of some trigger, with no awareness of the workflow rules. | Same plugin — Power Automate's connector issues the identical `Update` message. | None; flows that need to make a *governed* transition must instead call through the app's own governed write path (out of Dataverse, that's a client-authored mechanism, not this plugin's concern) or accept rejection like any other caller. |
| 3 | **Bulk Edit** (model-driven app grid, "Edit multiple records") | An admin/power-user selects many deal rows and mass-updates a field, potentially including stage/status. | Same plugin — Bulk Edit issues Update requests through the standard pipeline. | A bulk edit that also touches stage/status on many records will now fail loudly for every record whose transition is invalid, which is a deliberate, correct outcome — a stale-data warning, not a bug. |
| 4 | **Data import** (Import Wizard / Excel Online / dataflows) | A `.csv`/Excel import mapped to `cr664_loandeals` including stage/status columns. | Same plugin. | An import that includes invalid transitions will fail those rows; this is intended (imports must not become a governance bypass), but means a legitimate historical-data backfill needs a documented exception process (see below), not a code change. |
| 5 | **A second, unrelated custom app** registered against the same Dataverse environment, writing to the same table | Nothing in this repo controls what other apps exist in the tenant. | Same plugin — table-level enforcement is app-agnostic by construction; this is the primary reason the enforcement lives in Dataverse and not in this app's own code. | None from this plugin's perspective; a separate app *could* still legitimately need to make governed writes and would need to go through the same rules (which it now must, by design). |
| 6 | **A stale instance of this LOS itself** (an old browser tab, a client that read the deal before a concurrent change) | The exact "stale client overwrites newer state" scenario requirement 5 names. | Concurrency: stage-20 re-evaluation against the freshest pre-image rejects a transition no longer valid from the deal's *current* true state (see `CONCURRENCY_PROTECTION.md`). | A stale client attempting a transition that *coincidentally* is still valid from the new true state (e.g., two different bankers both trying to advance the same deal to the same next stage) will have its second attempt succeed as an independent, later, correctly-ordered advance — not treated as a conflict, because it isn't one: the transition is genuinely still legal. This is correct behavior, not a gap. |
| 7 | **A compromised or over-privileged integration/service account** with a valid Dataverse connection | Credential theft or an over-scoped service-principal used maliciously or by a buggy integration. | Same plugin — enforcement does not depend on which account is calling, only on the request itself (identity resolution for authorization, per contract §5, still applies to whoever the account resolves to). | If the compromised account also holds a security role permitted to bypass the plugin (an admin exempting themselves, or a role granted "act as system" broadly) — see #9. |
| 8 | **Direct SQL access** | Dataverse (Common Data Service) does not expose write access via the TDS/SQL endpoint — that endpoint is read-only by platform design. | Not applicable — no control needed; the platform itself prevents this vector. | None; noted here only so the model is explicit that this was considered, not overlooked. |
| 9 | **An actor granted a Dataverse security role that exempts them from plugin execution**, or an admin disabling the plugin step | Dataverse allows disabling a plugin step, or (rarely) configuring impersonation/bypass in ways this repo cannot audit from source. | Out of this plugin's control by definition — this is a **platform administration** control, not a code control. | This is the honest limit of any application-level (even Dataverse-plugin-level) enforcement: whoever can administer the platform itself can always turn off any control on it. Mitigation is organizational (change-management on who can register/unregister plugin steps and grant System Administrator), documented in `DEPLOYMENT_AND_ROLLBACK_PLAN.md`, not a further code control. |
| 10 | **A caller who supplies a request the plugin's filtering attributes don't catch** (e.g., writing `cr664_stagereference` via a different message the plugin isn't registered on, if one existed) | `Update` is the only message that can change these fields on an existing record (`Create` cannot set them meaningfully before the record exists, `SetState`/`Assign` don't touch these attributes). | Registration scoped to `Update`, filtered on the two attributes — no other message needs a registration for this specific field pair. | If a future schema change adds an alternate way to mutate these fields (e.g., a custom action), that new message would need its own registration — a maintenance note captured in `DEPLOYMENT_AND_ROLLBACK_PLAN.md`'s "when to revisit this" section. |

## What this model does **not** claim

- It does not claim the plugin, once armed, makes every business rule in
  `CANONICAL_TRANSITION_POLICY_CONTRACT.md` impossible to violate through some *other* table or
  field this initiative didn't scope (e.g., someone could still directly edit
  `cr664_documentchecklists` to fabricate a "reviewed" document status, which would then make an
  ADVANCE gate pass on a false premise — closing that is a separate, larger initiative: applying the
  same server-enforcement pattern to every fact-bearing table the requirement registry reads from,
  not just the deal's own stage/status fields. This is named explicitly as **out of scope** for this
  pass, not silently assumed solved.
- It does not claim protection against a Dataverse System Administrator acting in bad faith (#9) — no
  application-level control can claim that; it is a governance/personnel control, not a technical one.
- It does not claim the plugin is deployed today. Per the ADR, it is authored and reviewed by
  inspection only; this model describes what closes once it is built, registered, and armed — see
  `LIVE_OPERATOR_CERTIFICATION_SCRIPT.md` for how to prove that, live, before relying on it.

## Legitimate-exception process (so #4/#3 don't become "just disable the plugin")

Any genuine business need to write a stage/status value the plugin would reject (a one-time historical
backfill, a data-migration correction) should go through a **documented, time-boxed** disable/re-enable
of the specific plugin step by an operator with change-management sign-off — never a permanent
security-role exemption for a routine account. See `DEPLOYMENT_AND_ROLLBACK_PLAN.md`'s rollback
section for the exact steps and the audit trail this leaves.
