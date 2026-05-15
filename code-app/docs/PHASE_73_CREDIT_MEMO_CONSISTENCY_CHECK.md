# Phase 73 — Credit Memo Consistency Check (deterministic)

**Phase posture.** `read-only surface` with a `LOCAL_ONLY_FLOWS`
entry. Adds a deterministic, source-field-backed consistency
review on the existing Credit Memo card. No Dataverse write, no
audit row, no timeline event, no AI, no upload parsing, no
approval / credit decision, no automatic blocking, no
workflow automation, no schema work.

**Vibe capability advanced.** Closes the in-repo structured-data
slice of §1.14 Cross-document consistency checks from the
Phase 69 Vibe Capability Coverage Map. Lane A roadmap item #4.

Related canonical sources:
- [src/shared/creditMemoConsistency/checkCreditMemoConsistency.ts](../src/shared/creditMemoConsistency/checkCreditMemoConsistency.ts) — pure checker.
- [src/deals/CreditMemo.tsx](../src/deals/CreditMemo.tsx) — Phase 73 wiring (`ConsistencyReviewBlock`).
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `LOCAL_ONLY_FLOWS.credit-memo-consistency-check`.
- [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — §1.14 updated.

---

## 1. Checks implemented

Six deterministic finding types. Each fires only when both sides
of the comparison have data. Absent fields short-circuit silently
— the brief explicitly forbids inventing checks for fields that
don't exist.

| Finding id | Severity | Fires when … |
|---|---|---|
| `deal-name-reference` | `needs-review` | `deal.name` (≥ 4 chars) is not present as a case-insensitive substring in any memo / section `textPreview`. |
| `client-name-reference` | `needs-review` | `deal.clientName` (≥ 4 chars) is not present anywhere in memo text. |
| `stage-reference` | `informational` | `deal.stage` (≥ 4 chars) is not present in memo text. |
| `loan-amount-reference` | `informational` | `deal.amount` exists but no detected dollar amount in the memo lies within the order-of-magnitude window `[0.5 × amount, 2.0 × amount]`. |
| `loan-amount-mismatch` | `needs-review` | `deal.amount` exists AND a dollar amount in the window IS detected AND the closest such amount differs from `deal.amount` by > 5%. |
| `collateral-section-empty` | `informational` | A section labelled "Collateral" has an empty `textPreview` AND `deal.collateralSummary` is non-empty. |

The two amount checks (`loan-amount-reference` /
`loan-amount-mismatch`) are mutually exclusive by construction:
either there's no in-range amount (reference fires) or there is
one and it's close enough to pass / it isn't (mismatch fires).

## 2. Fields compared

**Read from `DealDetail` (structured deal):**
- `name`
- `clientName`
- `stage`
- `amount`
- `collateralSummary`

**Read from `CreditMemoData` (saved credit memo draft):**
- `memos[].textPreview` (string excerpt — up to 240 chars per the
  Phase 24 preview constant)
- `sections[].sectionLabel` + `sections[].textPreview`

The combined memo + section text forms a single haystack. All
checks operate over that haystack.

**Fields the checker DOES NOT read:**
- `deal.amount` numeric magnitudes outside the order-of-magnitude
  window — small fees / line-item amounts are intentionally not
  compared to the loan total.
- Any field with no structured anchor (banker preference fields,
  borrower contact info — none exists in the schema anyway).
- Per-memo `status` / `version` / `borrowerSafe` flags — these
  are governance metadata for the memo itself, not content to
  compare against deal facts.
- Generated-credit-memo body beyond `textPreview` — by design
  the preview is the source of comparison; loading full bodies
  would require additional queries the brief did not authorize.

## 3. Finding model

```ts
type ConsistencyFinding = {
  id: ConsistencyFindingId;
  severity: 'needs-review' | 'informational';
  fieldLabel: string;
  structuredValue: string | undefined;
  memoValue: string | undefined;
  message: string;
  source: 'structured-deal' | 'credit-memo-draft';
  confidence: 'deterministic';
};
```

Every finding carries `confidence: 'deterministic'`. There is no
model, no probabilistic scoring, no fuzzy match — the same inputs
always produce the same findings.

## 4. UI behavior

The Credit Memo card already had a Phase 26 `FreshnessBlock`.
Phase 73 adds a `ConsistencyReviewBlock` directly below it
inside the same Card. Three states:

1. **No saved memo draft to compare against** — copy reads
   `"Consistency review available after a memo draft is saved."`
   The "deterministic comparison; not AI; not an approval"
   footnote still appears.

2. **Memo draft present, no findings** — copy reads
   `"No consistency findings from available structured fields."`
   Header carries a "Consistency review" badge (clear severity).
   Footnote present.

3. **Findings present** — header shows the count
   ("N may need review · M informational" when both severities
   are present). Body renders a bulleted list of findings with
   a per-finding severity badge ("May need review" / "Informational")
   + the field label + the deterministic message. Footnote present.

The footnote always reads (or a close variant):

> Deterministic check, limited to available structured fields.
> Not AI. Not an approval or credit decision. Not a substitute
> for banker review.

Read-only manager + team views still render the consistency
block — it's derived-only and not gated on `canWrite`. The
Phase 36 / 37 read-only posture for the WRITE surface (the
"Generate Draft Preview" button) is preserved.

## 5. Conservative copy (pinned by tests)

**Used** (the brief mandated):
- "may need review"
- "does not appear to match" / "does not appear to reference"
- "structured value differs from memo draft"
- "memo may be missing available deal data"
- "Deterministic check, limited to available structured fields"
- "Not AI"
- "Not an approval or credit decision"
- "Not a substitute for banker review"

**Never used** (pinned by render-tree scans):
- "failed"
- "invalid"
- "noncompliant"
- "approved"
- "rejected"
- "hallucinated"
- "guaranteed mismatch"
- "AI-detected"

The conservative-copy ban applies to:
- The pure module's source code (module-hygiene test scans
  comment-stripped code).
- The Credit Memo card's rendered output (UI test scans
  `block.textContent`).

## 6. Limitations

| Limitation | Why |
|---|---|
| Memo text limited to `textPreview` (≤ 240 chars) | The Phase 24 preview constant is the only text surface DealDataProvider already loads. Loading full memo bodies would require new queries the brief did not authorize. |
| Substring matching only | Names with unusual punctuation (e.g. `Acme & Sons, LLC` vs `Acme and Sons`) may produce false positives. The banker reads the finding and judges. |
| Stage check is informational only | A banker memo may not always name the stage explicitly even when correct. We flag the absence as a hint, not a failure. |
| Amount detection is conservative | Bare digit groups (`4500000`) without a `$` prefix or `K`/`M` suffix are NOT detected. Section ids, phone numbers, and date fragments would produce too many false positives. |
| Order-of-magnitude window is heuristic | A `$50` fee in a `$4.5M` memo is silently excluded from the amount-magnitude comparison. The reference / mismatch checks only operate on amounts within `[0.5 × deal.amount, 2.0 × deal.amount]`. |
| No multi-memo aggregation | When a deal has multiple memo versions, the haystack is the union of every memo's `textPreview` + every section's `textPreview`. We don't attribute findings to a specific memo version. |
| No cross-document checks | Term sheets, PFS, tax returns are NOT parsed. Phase 73 is memo-vs-deal-structured-fields only. Cross-document is Lane C (upload) + Lane F (AI). |
| Not a substitute for review | Even with zero findings, the banker is the deciding authority. The footnote spells this out verbatim. |

## 7. Why this is NOT AI / document intelligence

- **Deterministic.** Same `(deal, creditMemo)` input → same `findings` output. No model call, no learned weights, no inference, no randomness.
- **Source-field-backed.** Every finding has a `structuredValue` (or empty), a `memoValue` (or empty), a `fieldLabel`, and a static `message` template. The mapping from inputs to findings is a small set of pure functions.
- **No upload parsing.** The check NEVER reads a binary document. `NOT_WIRED.document-upload` is unchanged.
- **No OCR, no entity extraction, no semantic similarity.** The amount regex catches the explicit currency tokens (`$`, `K`, `M`, "million"); the name checks are exact substring.
- **The pure module's source-text discipline is enforced.** A static-source test scans `checkCreditMemoConsistency.ts` (comments stripped) and asserts the words `approved`, `rejected`, `noncompliant`, `failed`, `invalid`, `AI`, `hallucinated`, and `guaranteed` do not appear in code or identifiers. The UI test scans the rendered card and asserts the same ban applies to user-facing text.

## 8. Why this is NOT approval / validation

- **No "validated" state.** The finding model never reports a "passed" or "approved" status — the absence of findings simply means "no consistency findings from available structured fields."
- **No "blocked" or "must fix".** Findings carry `severity: 'needs-review' | 'informational'` only. Neither severity gates any write.
- **No write coordination.** Findings are not persisted; not audited; not added to any timeline event. They live for the duration of the rendered card.
- **No credit decision.** The check tells the banker "consider whether the memo references the deal name" — the banker decides whether to update the memo. Phase 73 takes no opinion on the resulting credit decision.
- **The disclaimer is shipped + tested.** Every Consistency Review surface renders "Not an approval or credit decision. Not a substitute for banker review" verbatim, and the test sweeps banker-readable text for the forbidden language.

## 9. Future upgrade path

Stays Lane A unless an upstream change unlocks more:

- **Phase 74+ (still in-repo)**: extend checks to additional
  structured fields the schema already exposes — guarantor
  structure, pricing margin, spread index, customer type, etc.
  Pure derivation, more dimensions; no schema work.
- **Phase 74+ (still in-repo)**: persist memo full bodies in the
  load (extend `creditMemoQueries.ts` to fetch the long-form
  text) and run the same checks against the longer text. Adds
  one query, no new write.
- **Lane C (upstream)**: upload + parse term sheets / PFS / tax
  returns. Replace the haystack with parsed entities from those
  documents; reuse the existing finding model.
- **Lane F (upstream)**: layer AI semantic matching on top — a
  Copilot pass that catches "loan amount of four-point-five
  million dollars" (spelled-out text) without bespoke regex,
  catches "the deal" as a referent to the deal name, etc. The
  Phase 73 deterministic check would remain the reliability
  floor; AI would extend the signal coverage.
- **Lane B (upstream)**: persist findings to an audit-style ledger
  if leadership decides bankers should see consistency-check
  history across sessions. Today findings are derived-on-render
  only — adding persistence makes it a new governed write.

## 10. Phase 73 AAR

**Files created**
- [src/shared/creditMemoConsistency/checkCreditMemoConsistency.ts](../src/shared/creditMemoConsistency/checkCreditMemoConsistency.ts) — pure checker.
- [src/shared/creditMemoConsistency/checkCreditMemoConsistency.test.ts](../src/shared/creditMemoConsistency/checkCreditMemoConsistency.test.ts) — 30 assertions.
- [src/deals/CreditMemo.test.tsx](../src/deals/CreditMemo.test.tsx) — 6 UI assertions for the new block.
- [docs/PHASE_73_CREDIT_MEMO_CONSISTENCY_CHECK.md](PHASE_73_CREDIT_MEMO_CONSISTENCY_CHECK.md) — this document.

**Files modified**
- [src/deals/CreditMemo.tsx](../src/deals/CreditMemo.tsx) — added the `ConsistencyReviewBlock` component below the existing `FreshnessBlock`. Imports the pure checker; renders three states (no-draft, no-findings, findings); conservative footnote. No write surface affected; readOnly behavior preserved.
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — added `LOCAL_ONLY_FLOWS.credit-memo-consistency-check` (Phase 73).
- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — extended local-only-flows count assertion + new Phase 73 anchor (note disclaimer language; doc on disk).
- [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — §1.14 updated to reflect Phase 73 advancement.

**Vibe capability advanced**
- §1.14 Cross-document consistency checks — in-repo structured-data slice closed. Binary / AI slices remain Lane C + Lane F respectively.

**Checks implemented**
- 6 deterministic finding types (see §1).

**Source fields compared**
- Structured: `deal.name`, `deal.clientName`, `deal.stage`, `deal.amount`, `deal.collateralSummary`.
- Memo: `memos[].textPreview`, `sections[].sectionLabel`, `sections[].textPreview`.

**Limitations documented**
- 8 limitations enumerated in §6.

**Surfaces updated**
- Credit Memo card: new `ConsistencyReviewBlock` below `FreshnessBlock`. Always visible (banker / manager / team) — derived-only, no write surface change. Other workspaces unchanged.

**LOCAL_ONLY_FLOWS / governed-write status**
- New `LOCAL_ONLY_FLOWS.credit-memo-consistency-check` (Phase 73).
- No new governed write. `GOVERNED_WRITES.length === 11` unchanged.

**Tests added/updated**
- 30 pure-checker assertions (no-draft / clean memo / each of the 6 finding types in isolation / amount-extraction edge cases / module hygiene).
- 6 UI assertions covering three states, conservative-copy ban, readOnly preservation, loading-state.
- 2 inventory anchor assertions (note disclaimer language + doc on disk).
- Net: +38 tests.

**Confirmations**
- No AI / upload / parsing / decisioning added. Pinned by both source-text discipline (in `checkCreditMemoConsistency.ts`) and rendered-text discipline (in the UI test).
- No Dataverse writes added. `GOVERNED_WRITES.length === 11` unchanged.
- No new governed write.
- No schema work. The checker reads only data that DealDataProvider already loads.
- All Phase 46/47/49/50 inventory discipline sweeps still pass.

**Test / build counts**
- 1157 → 1195 tests passing (+38 net).
- Build clean.

**Recommended next phase**
- **Phase 74 — Accessibility audit + targeted fixes** (Lane A item #5; capability §1.28 — the only Vibe capability that hasn't been a phase brief yet). Single highest in-repo Vibe-coverage gap that doesn't compete with the analytics / activity-intelligence / consistency-check lineage of Phases 71/72/73.
- Alternatives:
  - **Phase 74 — Banker personal activity summary** — port Phase 71 primitives to a per-banker card on the Banker Workspace (deferred from Phase 71).
  - **Phase 74 — Extend Phase 73 consistency checks to additional structured fields** (guarantor structure, pricing margin, spread margin) — pure derivation extension.
