import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('durable-record server enforcement governance', () => {
  it('pins all seven durable tables to the initiating Dataverse identity', () => {
    const source = read(
      'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs',
    );
    for (const table of [
      'cr664_creditapprovaldecision',
      'cr664_commitmentrecord',
      'cr664_conditionverification',
      'cr664_executeddocattestation',
      'cr664_bookingqccheck',
      'cr664_adverseactionrecord',
      'cr664_fundingauthorization',
    ]) {
      expect(source).toContain(`"${table}"`);
    }
    expect(source).toContain(
      'CreateOrganizationService(context.InitiatingUserId)',
    );
    expect(source).toContain('cr664_activeaccessflag');
    expect(source).toContain('cr664_userloginmapping');
    expect(source).toContain('FundingDualControlThreshold = 250000m');
    expect(source).toContain('This governed record is append-only');
    expect(source).toContain('cannot be deleted');
  });

  it('registers exactly 21 synchronous PreOperation steps and seven pre-images', () => {
    const manifest = JSON.parse(
      read(
        'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernanceRegistration.json',
      ),
    ) as {
      stage: number;
      mode: number;
      entities: Array<{ logicalName: string; preImageAttributes: string }>;
      messages: string[];
    };
    expect(manifest.stage).toBe(20);
    expect(manifest.mode).toBe(0);
    expect(manifest.entities).toHaveLength(7);
    expect(manifest.messages).toEqual(['Create', 'Update', 'Delete']);
    expect(manifest.entities.every((row) => row.preImageAttributes.length > 0)).toBe(
      true,
    );
    expect(manifest.entities.length * manifest.messages.length).toBe(21);
  });

  it('keeps registration hash-pinned, reversible, and dry-run by default', () => {
    const project = read(
      'dataverse-plugins/CommercialLendingLOS.Plugins/CommercialLendingLOS.Plugins.csproj',
    );
    const registrar = read(
      'scripts/dataverse/register-durable-record-governance-plugin.ps1',
    );
    expect(project).toContain('<SignAssembly>true</SignAssembly>');
    expect(project).toContain('<AssemblyOriginatorKeyFile>');
    expect(registrar).toContain('[switch]$Apply');
    expect(registrar).toContain('[switch]$RegisterDisabled');
    expect(registrar).toContain('Assembly hash mismatch');
    expect(registrar).toContain("messagepropertyname = 'Target'");
    expect(registrar).not.toMatch(/Remove-Item|Method Delete|Invoke-RestMethod -Method Delete/i);
  });

  it('requires four unassigned, distinct human identities and least-privilege roles', () => {
    const manifest = JSON.parse(
      read(
        'docs/governance/production-go-identity-provisioning-manifest.json',
      ),
    ) as {
      identities: Array<{
        key: string;
        upn: string | null;
        requiredDataverseSecurityRoles: string[];
      }>;
    };
    expect(manifest.identities.map((identity) => identity.key)).toEqual([
      'credit-approver',
      'funding-approver-1',
      'funding-approver-2',
      'boarding-servicing-operator',
    ]);
    expect(manifest.identities.every((identity) => identity.upn === null)).toBe(
      true,
    );
    expect(
      manifest.identities.every(
        (identity) =>
          identity.requiredDataverseSecurityRoles.includes('Basic User') &&
          !identity.requiredDataverseSecurityRoles.includes(
            'System Administrator',
          ),
      ),
    ).toBe(true);
  });

  it('keeps the incomplete Skeeterhawk patch blocked and non-fabricated', () => {
    const manifest = JSON.parse(
      read(
        'docs/governance/SKEETERHAWK_BOARDED_LOAN_CORRECTION_MANIFEST_2026-07-29.json',
      ),
    ) as {
      target: { loanNumber: string; etag: string };
      requiredAuthoritativeInputs: Array<{ value: unknown; status: string }>;
      proposedPatch: unknown;
      verdict: string;
    };
    expect(manifest.target.loanNumber).toBe('0100066127');
    expect(manifest.target.etag).toBe('W/"4727477"');
    expect(manifest.proposedPatch).toBeNull();
    expect(
      manifest.requiredAuthoritativeInputs.every(
        (input) => input.value === null && input.status === 'BLOCKED',
      ),
    ).toBe(true);
    expect(manifest.verdict).toBe(
      'BLOCKED_AWAITING_AUTHORITATIVE_SERVICING_VALUES',
    );
  });
});
