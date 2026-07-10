import { describe, it, expect } from 'vitest';
import {
  Cr664_loandealscr664_customertype as CUSTOMER_TYPE,
  Cr664_loandealscr664_guarantorstructure as GUARANTOR_STRUCTURE,
  Cr664_loandealscr664_industry as DEAL_INDUSTRY,
} from '../generated/models/Cr664_loandealsModel';
import { CRM_PARTY_TYPES } from '../crm/crmPartyTypes';

/**
 * Concept-distinction guards. Seven concepts must never be collapsed into one field or share a
 * label with a different meaning: CRM party Type, deal Customer Type (New/Existing), NAICS code,
 * NAICS-derived sector, deal Industry (choice), guarantor identity, and guaranty structure.
 */

describe('deal + CRM concept distinctions (must not be collapsed or reuse labels)', () => {
  it('deal Customer Type options remain exactly New / Existing (authoritative domain contract)', () => {
    expect(new Set<string>(Object.values(CUSTOMER_TYPE))).toEqual(new Set(['New', 'Existing']));
  });

  it('guaranty structure options are exactly Unlimited / Limited / None — a STRUCTURE, not a guarantor identity', () => {
    expect(new Set<string>(Object.values(GUARANTOR_STRUCTURE))).toEqual(new Set(['Unlimited', 'Limited', 'None']));
  });

  it('Customer Type, guaranty structure, and deal Industry are three distinct option sets (no shared values)', () => {
    const ct = new Set<string>(Object.values(CUSTOMER_TYPE));
    const gs = new Set<string>(Object.values(GUARANTOR_STRUCTURE));
    const ind = new Set<string>(Object.values(DEAL_INDUSTRY));
    const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));
    expect(overlaps(ct, gs)).toBe(false);
    expect(overlaps(ct, ind)).toBe(false);
    expect(overlaps(gs, ind)).toBe(false);
  });

  it('CRM party Type is distinct from deal Customer Type (Borrower/Prospect… ≠ New/Existing)', () => {
    const party = new Set<string>(CRM_PARTY_TYPES as readonly string[]);
    const ct = new Set<string>(Object.values(CUSTOMER_TYPE));
    expect([...party].some((x) => ct.has(x))).toBe(false);
  });

  it('guaranty STRUCTURE never carries a party/identity token (guaranty structure ≠ guarantor identity)', () => {
    // CRM party Type includes "Guarantor" (a WHO / identity role). The guaranty STRUCTURE option set
    // must not include that identity token — the two are separate concepts.
    const party = new Set<string>(CRM_PARTY_TYPES as readonly string[]);
    expect(party.has('Guarantor')).toBe(true); // identity role exists on the CRM side
    const gs = new Set<string>(Object.values(GUARANTOR_STRUCTURE));
    expect(gs.has('Guarantor')).toBe(false); // structure never conflates the identity token
  });
});
