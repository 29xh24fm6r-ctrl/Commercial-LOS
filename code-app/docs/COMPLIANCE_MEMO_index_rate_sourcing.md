# MEMO — Index Rate Sourcing: Compliance Sign-Off Requested

**To:** Compliance / Loan Administration
**From:** Matthew Paller, Commercial Lending Systems
**Re:** Source-of-record approval for automated index rates used in variable/adjustable loan pricing
**Decision needed by:** _[date]_

---

## Purpose

The Commercial Loan Origination & Portfolio Management System is adding an automated, governed feed of reference index rates (SOFR, 5-Year Treasury, Prime) used to compute the **fully-indexed rate** on variable and adjustable loans in portfolio servicing. Before the feed is activated for pricing, we need Compliance to confirm the **source of record** for each index and, for Prime, confirm which published series our loan agreements actually reference. These are the three questions below.

## How the system uses these rates

For each variable/adjustable loan, the fully-indexed rate = the loan's contractual index + its spread. The system reads the current value of each index and applies it to loans priced off that index. Every rate the system stores carries its **effective date** and a **source label**, and history is **append-only** (rates are never overwritten; corrections are new rows). Rates older than three business days are flagged as stale and are not silently used; if no sourced rate is available, the system requires manual entry with a recorded source and notes. No rate is ever fabricated or estimated.

Because the fully-indexed rate flows into borrower-facing pricing and into portfolio risk reporting, the index the system feeds should match the index named in the loan documents, and the source should be one Compliance is comfortable defending as authoritative.

## Proposed approach (pending your approval)

Retrieve all three indexes daily from **FRED (Federal Reserve Economic Data, published by the Federal Reserve Bank of St. Louis)** via a single automated, server-side process, storing the original publisher in the source label for traceability. FRED is a free, widely used redistributor of federal rate data. The alternative is to source each index directly from its primary publisher (more authoritative provenance, but three separate integrations to maintain).

## Questions for Compliance

**1. SOFR — source of record.**
SOFR is administered and published by the Federal Reserve Bank of New York. FRED's `SOFR` series is a faithful redistribution of that published rate, typically available on FRED one business day after the reference date. **Is FRED acceptable as our source of record for SOFR, or must we source SOFR directly from the New York Fed?**

**2. 5-Year Treasury (Constant Maturity) — source of record.**
The 5-Year Treasury CMT is published by the U.S. Department of the Treasury in its Daily Treasury Par Yield Curve. FRED's `DGS5` series mirrors it. **Is FRED acceptable as our source of record for the 5-Year Treasury, or must we source directly from Treasury?**

**3. Prime — which series do our loan documents reference? (highest-priority question)**
There are two commonly used "prime" figures: the **Wall Street Journal Prime Rate**, which most commercial loan documents reference, and the **Federal Reserve H.15 Bank Prime Loan Rate**, which is what FRED's `DPRIME` series carries. These track each other closely but are distinct published series. To price Prime-based loans correctly, we need to know which one our agreements name. Please confirm one of the following:

- (a) Our variable/adjustable loan agreements reference the Federal Reserve / H.15 prime — in which case `DPRIME` is the exact match; or
- (b) Our agreements reference WSJ Prime, and `DPRIME` (H.15 prime) is acceptable as a documented faithful proxy; or
- (c) Our agreements reference WSJ Prime and we must source WSJ Prime specifically.

Until this is resolved, the system will ingest Prime but display it as **"source unconfirmed"** and will not treat it as a confirmed pricing input.

## Controls already built in (for your assessment)

- Retrieval is server-side and bank-controlled; no external rate calls are made from the user's browser, and no API credentials are exposed to users.
- Every stored rate carries its source label and effective date; the fully-indexed rate on any loan is traceable back to a specific sourced reading.
- History is append-only and effective-dated; stale or missing rates are flagged visibly and block silent pricing; manual overrides are permitted only with a recorded source and required notes, and are themselves retained as audit rows.

## Related operational confirmations (not blocking sign-off, noted for awareness)

- The FRED API key will be stored as a server-side secret in the retrieval process, not in application code.
- Daily retrieval is scheduled after each series' expected publication time; we will confirm the schedule against actual publication times during setup.

---

**Compliance decision:**

- Q1 (SOFR source of record): ☐ FRED acceptable ☐ Require NY Fed direct
- Q2 (Treasury source of record): ☐ FRED acceptable ☐ Require Treasury direct
- Q3 (Prime series): ☐ (a) H.15/DPRIME ☐ (b) DPRIME as documented proxy ☐ (c) source WSJ Prime

Signed: _______________________  Date: __________
