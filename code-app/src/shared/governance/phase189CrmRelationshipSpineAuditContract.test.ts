import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189A — CRM relationship-spine READ-ONLY audit — script contract pins.
 *
 * The `--inspect-crm-relationship-graph` mode resolves EXACTLY ONE Loan Deal
 * and walks its CRM relationship graph (Client / Banker / Team / Platform
 * User / activity) using pure metadata + data GETs. It must never write, never
 * contact a borrower, and never touch the document-checklist path. These are
 * source-level pins only — they never run the script or hit Dataverse.
 */

const SCRIPT = readFileSync(
  resolve(__dirname, '..', '..', '..', 'scripts', 'phase122-lookup-repair.mjs'),
  'utf8',
);

// The Phase 189A implementation section: from its banner comment to main().
const SECTION_START = SCRIPT.indexOf(
  '// Phase 189A — CRM relationship-spine read-only audit.',
);
const SECTION_END = SCRIPT.indexOf('async function main() {', SECTION_START);
const SECTION = SCRIPT.slice(SECTION_START, SECTION_END);

describe('section exists', () => {
  it('the Phase 189A read-only audit block is present and precedes main()', () => {
    expect(SECTION_START).toBeGreaterThan(-1);
    expect(SECTION_END).toBeGreaterThan(SECTION_START);
    expect(SECTION).toMatch(/async function runInspectCrmRelationshipGraph\(/);
  });
});

describe('mode wiring', () => {
  it('parses --inspect-crm-relationship-graph and sets dryRun off (it does no writes anyway)', () => {
    expect(SCRIPT).toMatch(/arg === '--inspect-crm-relationship-graph'/);
    expect(SCRIPT).toMatch(/flags\.inspectCrmRelationshipGraph = true/);
  });

  it('adds --deal-id (GUID-validated) and --json flags', () => {
    expect(SCRIPT).toMatch(/arg === '--deal-id'/);
    expect(SCRIPT).toMatch(/--deal-id expects a GUID/);
    expect(SCRIPT).toMatch(/arg === '--json'/);
  });

  it('has a distinct MODE banner and is dispatched in main()', () => {
    expect(SCRIPT).toMatch(/INSPECT-CRM-RELATIONSHIP-GRAPH \(read-only\)/);
    expect(SCRIPT).toMatch(/if \(FLAGS\.inspectCrmRelationshipGraph\) \{/);
    expect(SCRIPT).toMatch(/await runInspectCrmRelationshipGraph\(/);
  });
});

describe('mutual exclusivity with existing modes', () => {
  it('inspectCrmRelationshipGraph is in the exclusiveModes array', () => {
    const arr = SCRIPT.slice(
      SCRIPT.indexOf('const exclusiveModes = ['),
      SCRIPT.indexOf('].filter(Boolean);'),
    );
    expect(arr).toMatch(/flags\.inspectCrmRelationshipGraph,/);
  });

  it('requires EXACTLY ONE of --deal-name / --deal-id (both or neither bails)', () => {
    expect(SCRIPT).toMatch(
      /--inspect-crm-relationship-graph requires exactly one of --deal-name/,
    );
    // The check is the classic XOR: haveName === haveId -> bail.
    expect(SCRIPT).toMatch(/if \(haveName === haveId\) \{/);
  });

  it('--deal-id is rejected outside the CRM audit mode', () => {
    expect(SCRIPT).toMatch(
      /--deal-id is only valid alongside --inspect-crm-relationship-graph/,
    );
  });

  it('--upn is allow-listed for the mode (optional, not required)', () => {
    expect(SCRIPT).toMatch(/\} else if \(flags\.inspectCrmRelationshipGraph\) \{/);
    // The mode must appear in the trailing --upn allow-list message too.
    expect(SCRIPT).toMatch(
      /--upn is only valid alongside[^']*--inspect-crm-relationship-graph/,
    );
  });
});

describe('read-only — no writes anywhere in the CRM inspection path', () => {
  it('the section issues no POST / PATCH / DELETE', () => {
    expect(SECTION).not.toMatch(/method:\s*'POST'/);
    expect(SECTION).not.toMatch(/method:\s*'PATCH'/);
    expect(SECTION).not.toMatch(/method:\s*'DELETE'/);
  });

  it('every fetch in the section is an explicit GET', () => {
    const methods = SECTION.match(/method:\s*'[A-Z]+'/g) ?? [];
    expect(methods.length).toBeGreaterThan(0);
    for (const m of methods) expect(m).toMatch(/'GET'/);
  });

  it('the section never publishes metadata or mutates a solution', () => {
    expect(SECTION).not.toMatch(/PublishXml/);
    expect(SECTION).not.toMatch(/PublishAllXml/);
    expect(SECTION).not.toMatch(/RelationshipDefinitions/);
    expect(SECTION).not.toMatch(/MSCRM\.SolutionUniqueName/);
    expect(SECTION).not.toMatch(/Prefer:\s*'return=representation'/);
  });
});

describe('real lookup vs pseudo GUID column distinction', () => {
  it('reuses the certified classifyAttribute probe (real-lookup vs pseudo-scalar)', () => {
    expect(SECTION).toMatch(
      /await classifyAttribute\(CRM_AUDIT_DEAL_TABLE, rel\.logical, token, envUrl\)/,
    );
    expect(SECTION).toMatch(/c\.classification === 'real-lookup'/);
    expect(SECTION).toMatch(/c\.classification === 'pseudo-scalar'/);
    expect(SECTION).toMatch(/isRealLookup: c\.classification === 'real-lookup'/);
  });

  it('reads the real-lookup _value projection but the raw column for a pseudo scalar', () => {
    expect(SECTION).toMatch(/\$select=\$\{encodeURIComponent\(rel\.valueProjection\)\}/);
    expect(SECTION).toMatch(/\$select=\$\{encodeURIComponent\(rel\.logical\)\}/);
  });

  it('flags a pseudo column carrying a GUID as the UNSAFE case', () => {
    expect(SECTION).toMatch(/function crmAuditLooksLikeGuid\(/);
    expect(SECTION).toMatch(
      /c\.classification === 'pseudo-scalar' &&\s*crmAuditLooksLikeGuid\(finding\.linkedValue\)/,
    );
    expect(SECTION).toMatch(/report\.unsafe\.push\(/);
  });
});

describe('honest CRM graph reporting (Client / Borrower / Contact / Banker / Team)', () => {
  it('inspects the de-facto canonical Client table', () => {
    expect(SECTION).toMatch(/CRM_AUDIT_CLIENT_TABLE = 'cr664_clientrelationship'/);
    expect(SECTION).toMatch(/getTableMetadata\(CRM_AUDIT_CLIENT_TABLE, token, envUrl\)/);
  });

  it('reports the planned Salesforce-style spine tables present/absent (never creates them)', () => {
    for (const t of [
      'cr664_crmorganization',
      'cr664_crmperson',
      'cr664_crmcontactpoint',
      'cr664_crmrelationship',
      'cr664_crmroleassignment',
      'cr664_crmtimelineevent',
    ]) {
      expect(SECTION).toMatch(new RegExp(t));
    }
    expect(SECTION).toMatch(/crmAuditTableExists\(/);
  });

  it('probes the standard Dataverse account/contact equivalents', () => {
    expect(SECTION).toMatch(/for \(const logical of \['account', 'contact'\]\)/);
  });

  it('optionally cross-checks the assigned banker -> team graph via --upn', () => {
    expect(SECTION).toMatch(/findBankerByEmail\(upn, token, envUrl\)/);
    expect(SECTION).toMatch(/teamMatchesDeal:/);
  });
});

describe('terminal statuses are honest (no fake success)', () => {
  it('zero deal matches block', () => {
    expect(SECTION).toMatch(/resolved\.matchCount === 0/);
    expect(SECTION).toMatch(/report\.status = 'CRM_GRAPH_BLOCKED'/);
  });

  it('multiple deal matches block', () => {
    expect(SECTION).toMatch(/resolved\.matchCount > 1/);
    expect(SECTION).toMatch(/Re-run with --deal-id <guid> to disambiguate/);
  });

  it('a missing relationship piece yields PARTIAL, not READY', () => {
    // PARTIAL is keyed on report.missing — and READY only when missing is empty
    // AND there were no unsafe findings AND no probe failure.
    expect(SECTION).toMatch(/report\.missing\.length > 0[\s\S]*?'CRM_GRAPH_PARTIAL'/);
    expect(SECTION).toMatch(/report\.status = 'CRM_GRAPH_READY'/);
  });

  it('an unsafe pseudo lookup yields CRM_GRAPH_UNSAFE_PSEUDO_LOOKUP', () => {
    expect(SECTION).toMatch(
      /report\.unsafe\.length > 0[\s\S]*?'CRM_GRAPH_UNSAFE_PSEUDO_LOOKUP'/,
    );
  });

  it('all four documented statuses appear in the section', () => {
    for (const s of [
      'CRM_GRAPH_READY',
      'CRM_GRAPH_PARTIAL',
      'CRM_GRAPH_BLOCKED',
      'CRM_GRAPH_UNSAFE_PSEUDO_LOOKUP',
    ]) {
      expect(SECTION).toMatch(new RegExp(s));
    }
  });
});

describe('no borrower contact / checklist / comms coupling', () => {
  it('the whole script imports only Node builtins — no app modules at all', () => {
    const imports = SCRIPT.match(/^import .*$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) {
      expect(line).toMatch(/from 'node:[a-z_/]+';/);
    }
  });

  it('the CRM audit section never imports / references a checklist or comms path', () => {
    expect(SECTION).not.toMatch(/documentchecklist/i);
    expect(SECTION).not.toMatch(/checklist/i);
    expect(SECTION).not.toMatch(/sendDocumentRequest/i);
    expect(SECTION).not.toMatch(/prepareDocumentRequestHandoff/i);
    expect(SECTION).not.toMatch(/\bemail\b/i);
    expect(SECTION).not.toMatch(/\bSMS\b/i);
    expect(SECTION).not.toMatch(/Outlook/i);
    expect(SECTION).not.toMatch(/handoff/i);
  });

  it('the section contains no hard-coded record GUIDs', () => {
    expect(SECTION).not.toMatch(
      /'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'/,
    );
  });
});
