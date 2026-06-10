# Phase 149 — No-Fake-Data Certification

## Standard

Production source must not contain fake/sample/mock/demo data used as production fallbacks. Missing data must render honest unavailable states, not fabricated records.

## Prohibited Production Patterns

The following patterns are scanned and must not appear in production source (outside test files):

### Fake record constructors
- sampleDeal / sampleDeals
- mockDeal / mockDeals
- fakeDeal / fakeDeals
- demoDeal / demoDeals
- sampleClient / mockClient / fakeClient / demoClient
- sampleData / mockData / fakeData / demoData
- hardcodedDeals / placeholderRows
- lorem ipsum

### Fake success copy
- synced successfully
- pushed successfully
- Salesforce updated
- nCino updated
- connected successfully
- live write completed
- exported successfully
- PandaDoc envelope created
- bureau score found
- OFAC no match
- KYC approved
- core match found
- profitability calculated
- ROE calculated

## Allowed Test/Doc Fixtures

- Test files (*.test.ts, *.test.tsx) may use mock data for testing.
- Documentation may reference patterns as examples of what is prohibited.
- Scripts may use examples where clearly labelled.

## Surface-by-Surface Certification

| Surface | Data Source | Fake Data | Status |
|---------|------------|-----------|--------|
| Banker workspace | BankerProvider + loaders | None | Certified |
| Manager workspace | ManagerDataProvider | None | Certified |
| Team workspace | TeamDataProvider | None | Certified |
| Executive workspace | Executive data slots | None | Certified |
| Portfolio command center | ManagerDataProvider | None | Certified |
| CRM Command Center | CRM_SOURCE_OF_TRUTH_MAP + explicit VMs | None | Certified |
| CRM working surfaces | Explicit props | None | Certified |
| Salesforce/nCino lanes | Explicit props | None | Certified |
| Deal cockpit | DealDataProvider | None | Certified |
| Drill-through panels | buildDrillThroughTarget | None | Certified |

## Governance Scan Summary

Static governance tests scan all production source (excluding test files) for the prohibited patterns listed above. Any match fails the build.

## Remediation Process

If a future violation is detected:
1. Identify the file and pattern.
2. Replace fake fallback with honest unavailable state.
3. Verify governance scan passes.
4. Document the fix in the commit message.

## Future Contributor Rule

**No production fallback rows/records.** Use honest unavailable states instead. If data is missing, say so. Do not invent records, metrics, or success states.

## Acceptance

```bash
npm test -- noFake fakeData governance
npm run build
```

No fake data. No sample production records. No mock production fallbacks.
