# Lint baseline (ESLint suppressions)

**Owner:** Commercial-LOS engineering (codeowner of `eslint.config.js`).
**Created:** Completion Phase E, 2026-06-29. **Mechanism:** ESLint v10 native bulk suppressions
(`eslint-suppressions.json`), not a custom allowlist.

## What is baselined and why

`eslint .` was failing on **162 pre-existing errors across 105 files** — legacy debt that predates
the path-to-completion arc. None of it is new: every file touched in this arc lints clean. To make
CI honest (fail on *new* lint, tolerate the known legacy set) without a sweeping mechanical rewrite
that would bloat the diff and risk behaviour changes, the existing errors are recorded in
`eslint-suppressions.json`.

Baselined errors by rule (count):

| count | rule |
|------:|------|
| 38 | `react-hooks/set-state-in-effect` |
| 32 | `@typescript-eslint/no-explicit-any` |
| 28 | `@typescript-eslint/no-unused-vars` |
| 24 | `react-refresh/only-export-components` |
| 16 | `no-irregular-whitespace` |
| 8 | `no-useless-assignment` |
| 4 | `react-hooks/purity` |
| 4 | `@typescript-eslint/no-require-imports` |
| 2 | `react-hooks/preserve-manual-memoization` |
| 2 | `no-useless-escape` |
| 1 each | `react-hooks/immutability`, `prefer-const`, `@typescript-eslint/no-empty-object-type`, `no-regex-spaces` |

5 **warnings** are intentionally left unsuppressed (warnings do not fail the gate) so they stay
visible as a burn-down signal.

## Rules for working with the baseline

- **New code must lint clean.** A new violation — in a new file, or beyond the recorded count in an
  existing file — fails `eslint .` (exit 1). The baseline only tolerates the exact recorded set.
- **Burn the baseline down; never grow it.** When you fix a baselined error, prune the now-unused
  entry with `npx eslint . --prune-suppressions` and commit the shrunk `eslint-suppressions.json`.
- **Do NOT run `eslint . --suppress-all` to make a red build green.** That would silently baseline
  *new* debt — the exact dishonesty this arc exists to remove. `--suppress-all` is a one-time
  baseline act, already done. If CI is red on lint, fix the new violation.
- The `lint` script is unchanged (`eslint .`); ESLint reads `eslint-suppressions.json` from the
  repo root automatically.

## Burn-down target

Top of the list (`set-state-in-effect`, `no-explicit-any`, `no-unused-vars`) is where the value
is. Drive the count to zero rule-by-rule; when `eslint-suppressions.json` is empty, delete it.
