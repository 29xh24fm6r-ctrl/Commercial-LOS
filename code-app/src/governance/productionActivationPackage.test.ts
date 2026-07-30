import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INITIAL_OGB_OPTION_A_POLICY } from './initialOgbOptionAPolicy';

interface ActivationManifest {
  readonly activationState: string;
  readonly pluginPackage: { readonly path: string; readonly sha256: string };
  readonly schemaPlan: { readonly path: string; readonly sha256: string };
  readonly schemaProvisioner: {
    readonly path: string;
    readonly sha256: string;
    readonly dryRunByDefault: boolean;
  };
  readonly initialPolicy: {
    readonly path: string;
    readonly sha256: string;
    readonly productionPersisted: boolean;
    readonly productionActivated: boolean;
  };
  readonly authorityPlan: { readonly path: string; readonly sha256: string; readonly realAssignments: number };
  readonly registrationManifest: {
    readonly path: string;
    readonly sha256: string;
    readonly productionRegisteredByThisPackage: boolean;
  };
  readonly approvalRequired: readonly string[];
}

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('PR 8 production activation package', () => {
  const manifest = json<ActivationManifest>(
    'deployment/bank-credit-governance/activation-manifest.json',
  );

  it('pins every production input to its exact committed hash', () => {
    for (const item of [
      manifest.pluginPackage,
      manifest.schemaPlan,
      manifest.schemaProvisioner,
      manifest.initialPolicy,
      manifest.authorityPlan,
      manifest.registrationManifest,
    ]) {
      expect(sha256(item.path), item.path).toBe(item.sha256);
    }
  });

  it('packages exactly the approved Option A policy content without claiming activation', () => {
    const proposed = json<Record<string, unknown>>(manifest.initialPolicy.path);
    expect(proposed).toEqual({ ...INITIAL_OGB_OPTION_A_POLICY, status: 'ACTIVE' });
    expect(manifest.initialPolicy.productionPersisted).toBe(false);
    expect(manifest.initialPolicy.productionActivated).toBe(false);
    expect(manifest.activationState).toBe('NO_GO');
    expect(manifest.schemaProvisioner.dryRunByDefault).toBe(true);
  });

  it('contains only Matthew’s explicitly approved authority and no committee, vote, or approval rows', () => {
    const plan = json<{
      assignments: { upn: string; maximumAmount: number; maximumRelationshipExposure: number; maximumUnsecuredAmount: number }[];
      committeeMemberships: unknown[];
      temporaryDelegations: unknown[];
      titleOrWorkspaceInferencePermitted: boolean;
    }>(manifest.authorityPlan.path);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0]).toEqual(expect.objectContaining({
      upn: 'mpaller@oldglorybank.com',
      maximumAmount: 1_000_000,
      maximumRelationshipExposure: 1_000_000,
      maximumUnsecuredAmount: 0,
    }));
    expect(plan.committeeMemberships).toEqual([]);
    expect(plan.temporaryDelegations).toEqual([]);
    expect(plan.titleOrWorkspaceInferencePermitted).toBe(false);
    expect(manifest.authorityPlan.realAssignments).toBe(1);
  });

  it('requires one consolidated approval for every real production action', () => {
    expect(new Set(manifest.approvalRequired)).toEqual(new Set([
      'OGB_OVERRIDE_INTERPRETATION',
      'PRODUCTION_SCHEMA_PROVISIONING',
      'PRODUCTION_PLUGIN_REGISTRATION',
      'INITIAL_ACTIVE_OGB_POLICY',
      'PRODUCTION_AUTHORITY_ASSIGNMENTS',
      'PRODUCTION_DEPLOYMENT',
    ]));
    expect(manifest.registrationManifest.productionRegisteredByThisPackage).toBe(false);
  });

  it('contains no access-token-shaped property names or bearer values', () => {
    const serialized = [
      'deployment/bank-credit-governance/activation-manifest.json',
      manifest.schemaPlan.path,
      manifest.initialPolicy.path,
      manifest.authorityPlan.path,
    ].map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(serialized).not.toMatch(/access[_-]?token|refresh[_-]?token|authorization\s*:\s*bearer/i);
  });
});
