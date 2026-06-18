# Phase 190A — Power Platform Generated Artifact Build Recovery

## 0. Summary

A fresh clone of this repo **cannot `pnpm build`**. `tsc -b` fails with `TS2307`
because the generated Power Platform manifest

```
.power/schemas/appschemas/dataSourcesInfo
```

is **absent**. `.power/` is intentionally gitignored (repo-root `.gitignore`
rule `code-app/.power/`), so `.power/schemas/appschemas/dataSourcesInfo.ts` is a
**local, never-committed artifact**. This is repository / build-environment
debt — it is **not** a Phase 188K source-code failure. The Phase 188K targeted
gate is green (10 files / 900 tests).

This phase restores fresh-clone build determinism with a **safe, offline,
build-only fallback** (recovery **Option B**, delivered through an Option C
setup/codegen script and documented per Option A) and adds governance so future
fresh clones do not rediscover the failure.

This phase **enables nothing**, changes **no app behavior**, performs **no
Dataverse writes and no schema mutation**, sends **no borrower comms**, and
leaves every checklist gate disabled.

## 1. The failure

`pnpm build` runs `tsc -b`, which type-checks the whole program, including the
28 generated services and the two runtime readers that statically/dynamically
import the manifest. With `.power/` absent, every one of these fails:

```
src/deals/newDealAuditActorResolver.ts ........ ../../.power/schemas/appschemas/dataSourcesInfo
src/deals/newDealReferenceRuntimeReader.ts .... ../../.power/schemas/appschemas/dataSourcesInfo
src/generated/services/*Service.ts ............ ../../../.power/schemas/appschemas/dataSourcesInfo
```

Both failing import shapes:

- `../../.power/schemas/appschemas/dataSourcesInfo`
- `../../../.power/schemas/appschemas/dataSourcesInfo`

The two affected runtime files load the manifest only via **dynamic import**
inside a live `retrieve` (`getClient(dataSourcesInfo)`), so importing those
modules never pulls the SDK — but `tsc` still type-checks the specifier and
fails when the module is missing.

## 2. How the artifact is produced

`.power/schemas/appschemas/dataSourcesInfo.ts` is generated locally by the
Power Platform Code Apps toolchain (`pac code` / `@microsoft/power-apps`) when
data sources are added/pulled for the app described in the tracked
`power.config.json`. It maps each registered data-source **name** to a native
Dataverse entry (`tableId`, `version`, `primaryKey`, `dataSourceType`, `apis`)
plus any connector entries. It is **local-only** because the real manifest can
carry tenant- / connection-specific metadata that must never be committed.

Phase 170I added `scripts/sync-datasourcesinfo.mjs`, which **additively**
repairs an **existing** local manifest so it stays consistent with
`power.config.json` before a `pac code push`. That script requires the manifest
to already exist; it does **not** solve the fresh-clone "manifest absent" case.

## 3. The recovery — Option B via an offline preflight (Option C), documented (Option A)

Because the real manifest cannot be safely committed (tenant/connection data)
and offline determinism is required, this phase generates a **build-only
fallback** on demand:

`scripts/phase190A-power-artifact-preflight.mjs`

- `pnpm power:schemas:ensure` (also run automatically at the start of
  `pnpm build`): if the manifest is **absent**, write a build-only fallback
  derived **entirely** from the tracked `power.config.json` native data sources;
  if it is **present**, do nothing (a real pulled artifact is never overwritten,
  so live behavior is never changed).
- `pnpm power:schemas:check`: verify-only. Prints the failing import shapes, why
  the build fails, the regeneration command, and a no-secrets warning. **Exits
  non-zero only in this verification mode** when the manifest is absent.

The generated fallback:

- carries **only** native Dataverse entity-set names + `<logical>id` primary
  keys (the same names already present verbatim across the committed generated
  services);
- writes **no** connection ids, environment URLs, tenant ids, tokens, secrets,
  or connector `apis`;
- is clearly self-identified as a `BUILD-ONLY FALLBACK`;
- is GUID-free, offline, and idempotent;
- stays in gitignored `.power/` and is **never committed**.

The generated services and runtime readers are **unchanged** — they still
import the manifest through the same `.power/schemas/appschemas/dataSourcesInfo`
path. No `@ts-ignore`, no disabled type-checking, no removal from the build.

### Regenerate / recover (operator)

```
cd code-app
pnpm power:schemas:ensure     # writes a local build-only fallback iff absent
pnpm power:schemas:check      # exits 0 once the manifest is present
pnpm build                    # now succeeds
```

If you need the **real** manifest (for a real deployment / `pac code push`),
pull it via the documented Power Platform `pac code` path on an authenticated
machine; then `pnpm power:schemas:ensure` is a no-op and Phase 170I's
`scripts/sync-datasourcesinfo.mjs` keeps it in sync. **Never commit `.power/`.**

## 4. Safety posture (unchanged)

- **No Dataverse writes. No Dataverse schema mutation.** The preflight only ever
  reads the tracked `power.config.json` and writes a local file. It makes no
  network call and no solution import/export.
- **No secrets / tenant credentials committed.** The fallback and the script
  contain no URLs, tokens, client secrets, tenant ids, or local user paths.
  `.power/` remains gitignored; never commit it.
- **No app behavior changes. No generated service behavior changes.** Build
  pipeline only — the app's runtime uses the real manifest when present.
- **No borrower comms. No checklist enablement.** This phase does not enable UI
  generation, does not execute a live proof, does not create checklist rows, and
  does not contact borrowers.

### Checklist gates remain disabled (188I / 188J / 188K posture preserved)

```
DOCUMENT_CHECKLIST_PILOT_UI_ENABLED          = false
DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false
DOCUMENT_CHECKLIST_GENERATION_ENABLED         = false
```

Build recovery touches none of these flags and none of the 188I/188J/188K gate
files; all three rollback switches stay `false` and fail closed independently.

## 5. Verification

```
pnpm test -- phase190A releaseCandidateSnapshot
pnpm test -- documentChecklistPilot documentChecklistUiGenerationAction phase188K phase190A releaseCandidateSnapshot
pnpm build
```

`pnpm build` runs the ensure preflight first, so a fresh clone builds
deterministically with no manual step.
