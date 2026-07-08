# Deal Industry from CRM NAICS — maker setup (Phase 4B)

Deal Profile **Industry** should be consistent with the linked CRM client's NAICS
classification, not hand-entered independently. When a deal is linked (deal →
`cr664_Client` → client relationship → **CRM organization**) and that organization
has a NAICS code, the Deal Profile derives / reconciles Industry from it.

Two additive schema pieces make this possible (Claude owns the scripts; the
**maker (Matt)** applies them + regenerates the SDK — same split as
`NAICS_SETUP.md`):

1. A **reverse lookup** `cr664_Organization` on `cr664_clientrelationship` →
   `cr664_crmorganization`, so a bridged client points back at the CRM company it
   mirrors. Without it, a deal cannot reach the org's NAICS code.
2. An **admin-managed mapping table** `cr664_naicsindustrymap` (NAICS **sector** →
   deal industry label), seeded with only the defensible mappings.

Nothing here writes industry automatically. The app derives / warns / offers an
explicit **Apply CRM/NAICS industry** action; the write reuses the governed
`updateDealProfile` (readback + audit). If there is no mapping, the app shows an
honest blocked state and Industry stays banker-editable.

---

## 1. Add the org link + mapping table (create-missing-only)

Dry-run first (writes nothing):

```powershell
powershell -File scripts/dataverse/create-deal-industry-crm-naics.ps1
```

Then apply (gated; additive — nothing is renamed or deleted):

```powershell
powershell -File scripts/dataverse/create-deal-industry-crm-naics.ps1 -Apply
```

This creates the `cr664_clientrelationship_organization` relationship (lookup
`cr664_Organization`) and the `cr664_naicsindustrymap` table
(`cr664_sectorcode`, `cr664_dealindustry`, `cr664_activeflag`).

## 2. Publish + regenerate the SDK

```powershell
powershell -File scripts/dataverse/publish-customizations.ps1
powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1
```

Until the regen, the projection reads fail closed → the Deal Profile simply shows
no CRM/NAICS derivation and Industry stays manual (honest, no fabrication).

## 3. Seed the NAICS → industry mapping

```bash
node scripts/seed-naics-industry-map.mjs             # dry-run plan
```

```powershell
$env:DATAVERSE_BEARER_TOKEN = "<a Web API bearer token>"
node scripts/seed-naics-industry-map.mjs --commit
node scripts/seed-naics-industry-map.mjs --verify    # read-only smoke
```

The seed loads only the clear mappings and **leaves ambiguous sectors unmapped by
design**:

| NAICS sector | Deal industry |
|---|---|
| 31-33 Manufacturing | Manufacturing |
| 44-45 Retail Trade | Retail |
| 62 Health Care and Social Assistance | Healthcare |
| 53 Real Estate and Rental and Leasing | RealEstate |
| 51 Information | Technology |

Every other sector (Agriculture, Construction, Finance, Professional Services,
Accommodation/Food, etc.) is intentionally **not** mapped — a deal in one of those
sectors shows *"CRM NAICS found, but no mapped deal industry option exists"* and
the banker keeps manual control. This is deliberate: we never fabricate an
industry. Extend the mapping only with defensible additions (edit the seed or add
rows in the maker portal / a future Admin → NAICS Mapping panel).

## 4. Arm the org-link write (bridged clients start carrying the org link)

The org-link write in `bridgeOrgToClientRelationship` is **default-off**
(`BRIDGE_ORG_LINK_ENABLED = false`) so the existing bridge keeps working before
the lookup exists. After the schema is applied + regenerated, flip it via the
certified operator step so newly-bridged clients persist `cr664_Organization`.
(Already-bridged clients need a one-time backfill — set `cr664_Organization` on
their rows from the org they mirror; a small maker-side data job, or re-bridge.)

## 5. What stays honest (no fabrication)

- Industry is derived only through the governed path deal → client relationship →
  **organization** → `cr664_naicscode`. Contact-only records and unbridged orgs
  never drive Industry.
- Industry is never inferred from company name, website, or free text — only the
  structured NAICS code.
- Industry is never written automatically: the banker/admin applies a verified,
  mapped value explicitly (or an existing governed auto-apply path), readback-
  verified and audited.
- No mapping → honest blocked state; no fabricated industry.
