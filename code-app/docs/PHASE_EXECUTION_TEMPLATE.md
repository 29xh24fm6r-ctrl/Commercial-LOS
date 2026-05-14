# Phase Execution Template

Reusable format for phase briefs and phase deliverables. A brief that
follows this template does not need to restate the rules in
[ENGINEERING_OPERATING_RULES.md](ENGINEERING_OPERATING_RULES.md) or the
ownership pointers in [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md).

A brief that omits a section is understood to inherit the standing
default from this template.

---

## A. Brief format (what the user writes)

A phase brief should specify, at minimum:

1. **Phase number and title.** Numerical, sequential. Title states the
   capability or boundary, not the implementation.
2. **Scope.** What this phase ships. One paragraph max.
3. **Non-goals.** What this phase deliberately does **not** ship, even
   if it looks adjacent. Cite the relevant
   `NOT_WIRED` / `DELIBERATELY_BLOCKED` entry by id when applicable.
4. **Schema dependencies.** Any required Dataverse fields, services,
   or generated SDK additions. If the schema isn't ready, the brief
   must say whether the phase blocks or proceeds metadata-only.
5. **Governance posture.** Pick one:
   - `metadata-only` — no writes, no UI behavior change
   - `read-only surface` — UI renders new data, no writes
   - `governed write` — new entry in `GOVERNED_WRITES`
   - `refactor` — internal restructuring, outward behavior preserved
   - `tests / docs only` — no production code change
6. **Acceptance criteria.** Concrete, checkable. Not "looks good" —
   "renders X with Y disabled and Z gated on W".
7. **Standing defaults apply.** This line is implicit; the brief does
   not need to repeat it.

A brief should NOT specify:

- Coding style (governed by the existing codebase).
- Test framework choices (Vitest 3 + RTL 16).
- AAR format (governed by §C below until Phase 43 formalizes it).
- Refactor permissions (governed by
  [ENGINEERING_OPERATING_RULES.md §9](ENGINEERING_OPERATING_RULES.md)).
- Canonical ownership (governed by
  [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md)).

---

## B. Standing execution defaults

These apply to every phase unless the brief overrides them.

- **Behavior preservation is the default.** A refactor or
  metadata-only phase changes zero user-visible behavior. Build size
  may shift only because of legitimate code changes (added / removed
  modules), not as a side effect.
- **All prior tests stay green.** A red test is a regression to
  diagnose, never a test to silently delete.
- **Add regression protection** for the phase's scope. New governance
  rule → new test. New blocker → new test asserting it stays blocked.
  Removed inline duplication → new test pinning the canonical source.
- **Static-source assertions are encouraged** for modules that must
  not import certain dependencies. Use `readFileSync` against the
  module under test; pattern-match against import lines specifically,
  not English prose in comments.
- **Mocks use `vi.hoisted` for factory state.** Module mocks live at
  module top via `vi.mock`. Do not mock internals.
- **Build verification** is required for any phase that touches `.ts`
  or `.tsx` files. `npm run build` must exit clean.
- **Test verification** is required for any phase except pure-docs
  phases. The AAR reports the before / after test count.

---

## C. AAR format (until Phase 43 formalizes)

Every phase delivery ends with an After-Action Report. The Phase 41
AAR is the current reference example. Required sections:

1. **Files created** — absolute relative paths, one-line purpose each.
2. **Files modified** — same format; note what changed at a high
   level, not a diff.
3. **Inline-duplication removals** (if any) — what was centralized
   and where the canonical source lives now.
4. **Tests** — before count → after count → delta. Note any test
   files added or substantially expanded.
5. **Build** — clean / not clean, and the bundle size before / after.
6. **Schema blockers** — any blocker discovered or reaffirmed during
   this phase, even if pre-existing.
7. **Confirmations** — explicit statements that the standing defaults
   were honored:
   - production behavior unchanged (or what changed, with brief
     citation)
   - no canonical source duplicated
   - Release Readiness Gate renders identically (when applicable)
   - no blocked capability was enabled
8. **Newly discovered inconsistencies** — anything noticed that
   wasn't in scope but warrants a future brief. One line each; do
   not fix them in this phase.

The AAR is short by design. Detail belongs in the commit message and
the code itself, not in the AAR.

---

## D. When to deviate

If the phase cannot fit this template (rare), the brief must say so
explicitly and state which sections are being overridden. Examples:

- "This is a docs-only phase; skip build verification."
- "This phase intentionally changes copy on the X card; the
  behavior-preservation default does not apply."
- "This phase blocks; no acceptance criteria — the AAR will document
  the schema gap."

Silent deviation is the failure mode this template exists to prevent.
