# Concurrency Protection — Loan Deal Governed Transitions

**Requirement:** "Add concurrency protection so stale clients cannot overwrite newer governed state."

## The scenario

Banker A opens a deal at `CREDIT_APPROVAL`. Before A submits an Advance, Banker B (or an automated
process, or A in a second tab) also advances the same deal, and that write commits first — the deal
is now at `COMMITMENT`. A's client, still holding its stale read, submits its own Advance request,
still believing the deal is at `CREDIT_APPROVAL`. Without protection, A's request could either
(a) silently "succeed" against a value that's no longer true, corrupting the audit trail's honesty, or
(b) worse, overwrite B's newer state with a transition computed against stale facts.

## What was checked before designing this

`@microsoft/power-apps/data`'s `updateRecordAsync(tableName, id, changes)` (the only write primitive
the generated SDK exposes — verified directly against
`node_modules/@microsoft/power-apps/dist/internal/data/core/types/index.d.ts` during this design, not
assumed) takes **no ETag / `If-Match` / row-version parameter**. Dataverse's Web API natively supports
optimistic concurrency via `If-Match` headers and `@odata.etag`, but this app's SDK layer does not
expose a hook to set one, and this repo's convention is to never hand-edit generated SDK files without
a failing workflow proving it necessary (`src/generated/**` — see repository engineering rules). Given
the design below achieves the actual required guarantee without it, adding a bespoke wrapper around
the generated service purely to carry an ETag was judged unnecessary scope for this initiative.

## The design: the transition graph itself is the concurrency guard

The Dataverse plugin's stage-20 (pre-operation, inside the write transaction) step re-evaluates the
full canonical policy — most importantly, "is `fromStage` → `toStage` a legal edge?" — against the
**pre-image Dataverse hands the plugin at that moment**, which reflects the record's true, currently
committed state (Dataverse's normal row-level locking during the Update pipeline ensures a second,
concurrent Update to the same record is serialized behind the first one's commit; the second request's
stage-20 pre-image is not the value the caller read minutes ago, it is the value actually in the
database right now).

Consequences, worked through for the scenario above:

1. **B's write commits first**, moving the deal `CREDIT_APPROVAL → COMMITMENT`. Ordinary transaction
   commit; nothing special.
2. **A's stale request arrives second.** Its payload still targets `toStage = COMMITMENT` (what A's
   client, reading the old `CREDIT_APPROVAL` state, believed was the one legal next step). At stage
   20, the plugin retrieves the pre-image — now `COMMITMENT`, not `CREDIT_APPROVAL` — and asks "is
   `COMMITMENT → COMMITMENT` a legal ADVANCE edge?" It is not (a stage cannot advance to itself; the
   only legal next stage from `COMMITMENT` is `DOCUMENTATION`). **The plugin rejects A's request as an
   illegal transition**, with a message naming the deal's actual current stage — not a generic
   "concurrency conflict," but a precise, honest "this deal is no longer at the stage you're advancing
   from" (§ error copy below).
3. **A's client sees the rejection** (never a fabricated success — this repo's existing `update_failed`
   /`readback_failed` outcome handling already does not paper over a failed write, verified during
   design against `DealStageProgressionCard.tsx`), and must re-read the deal to see its real current
   state before deciding what to do next (nothing in this initiative auto-retries or auto-resolves a
   conflict on the caller's behalf — that would risk acting on a decision the banker never actually
   made about the *new* state).

This holds symmetrically for RETURN (target must be a member of `priorStages(currentTrueStage)`,
re-evaluated fresh), DECLINE/WITHDRAW (current status must still be non-terminal at the fresh
pre-image), and even the degenerate "both bankers tried to make the exact same transition" case (the
second one now sees a pre-image *already* at the destination, so its own transition is no longer a
legal edge from that pre-image either, and is rejected the same way — not treated as a harmless no-op,
because silently accepting it would produce a second, misleading audit row claiming a transition that
didn't actually happen from that state).

## What this does and does not cover

- **Covers:** any race where two requests disagree about the deal's stage or status at the moment of
  write — exactly the "stale client" requirement. No explicit version token, ETag, or client change is
  needed; the graph check *is* the guard, because an invalid transition and a stale transition are, for
  this specific field pair, the same thing by construction (the ordering graph has no back-edges or
  self-edges for ADVANCE, and RETURN/DECLINE/WITHDRAW's own preconditions — prior-stage membership,
  non-terminal status — are exactly the facts that change when someone else's write already landed).
- **Does not cover:** a race on a *different* field on the same record (e.g., two concurrent edits to
  `cr664_amount`) — out of scope, because this plugin only fires when `cr664_stagereference` or
  `cr664_statusreference` is part of the update; Dataverse's own last-write-wins semantics apply to
  every other field, unchanged, exactly as they do today for every other write path in this app.
- **Does not cover:** a race between the stage-10 pre-validation read and the stage-20 pre-operation
  read *within the same single request* — these are microseconds apart in one pipeline execution, not
  a cross-request race, and are not a source of the "stale client" problem this requirement targets.

## Why this is sufficient without a client-visible version token

A version-token/ETag design (the more textbook approach) additionally protects against a caller who
reads the record, makes an *unrelated* decision based on stale data, and writes back including
stage/status fields unchanged from what they read but *alongside* other now-stale assumptions. That
scenario does not exist in this app's actual write shape: every governed transition write in this
codebase (`buildLiveStageAdvanceDeps.ts`, `buildLiveCanonicalTransitionDeps.ts`) sends **only** the
fields relevant to the transition itself (`cr664_StageReference@odata.bind`, `cr664_stageentrydate`,
optionally `cr664_StatusReference@odata.bind`) — never a full-record "read, mutate, write back
everything" pattern that could silently reassert other stale field values. Given that shape, the
transition-graph re-check at stage 20 is a complete concurrency guard for the problem this
initiative's requirement 5 actually describes. If a future change to this app's write pattern moves
toward full-record read-modify-write, this conclusion should be revisited and an ETag-based guard
reconsidered (tracked as a documented follow-up, not a currently-open gap).
