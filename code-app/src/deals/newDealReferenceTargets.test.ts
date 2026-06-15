import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NEW_DEAL_REFERENCE_TARGETS,
  NEW_DEAL_REFERENCE_TARGETS_CONFIRMED_ON,
  NEW_DEAL_REFERENCE_TARGETS_IDENTIFIED,
  NEW_DEAL_REFERENCE_TARGETS_REGISTERED,
  NEW_DEAL_REFERENCE_RESOLVER_AVAILABLE,
  NEW_DEAL_REFERENCE_TARGETS_SOURCE_COMMAND,
  STAGE_REFERENCE,
  STATUS_REFERENCE,
} from './newDealReferenceTargets';
import {
  STAGE_REFERENCE as RESOLVER_STAGE_REFERENCE,
  STATUS_REFERENCE as RESOLVER_STATUS_REFERENCE,
} from './newDealReferenceResolver';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../admin/adminNewDealIntakeModel';

/**
 * Phase 170D / 170D-R -- canonical Stage/Status reference lookup targets.
 * Metadata-only, GUID-free, no resolver wiring, no create. One source of
 * truth consumed by both the resolver and the admin panel.
 */

describe('Phase 170D -- confirmed reference targets', () => {
  it('records exactly the Stage and Status lookup targets', () => {
    expect(NEW_DEAL_REFERENCE_TARGETS.map((t) => t.label)).toEqual(['Stage', 'Status']);
  });

  it('carries the live Stage target metadata from the inspect output', () => {
    const stage = NEW_DEAL_REFERENCE_TARGETS.find((t) => t.label === 'Stage');
    expect(stage?.lookupAttribute).toBe('cr664_stagereference');
    expect(stage?.lookupSchemaName).toBe('cr664_StageReference');
    expect(stage?.odataBindKey).toBe('cr664_StageReference@odata.bind');
    expect(stage?.targetTableLogicalName).toBe('cr664_dealstagereference');
    expect(stage?.targetEntitySetName).toBe('cr664_dealstagereferences');
    expect(stage?.primaryIdAttribute).toBe('cr664_dealstagereferenceid');
    expect(stage?.primaryNameAttribute).toBe('cr664_name');
    expect(stage?.selectorFields).toContain('cr664_code');
    expect(stage?.selectorFields).toContain('cr664_activeflag');
  });

  it('carries the live Status target metadata from the inspect output', () => {
    const status = NEW_DEAL_REFERENCE_TARGETS.find((t) => t.label === 'Status');
    expect(status?.lookupAttribute).toBe('cr664_statusreference');
    expect(status?.lookupSchemaName).toBe('cr664_StatusReference');
    expect(status?.odataBindKey).toBe('cr664_StatusReference@odata.bind');
    expect(status?.targetTableLogicalName).toBe('cr664_dealstatusreference');
    expect(status?.targetEntitySetName).toBe('cr664_dealstatusreferences');
    expect(status?.primaryIdAttribute).toBe('cr664_dealstatusreferenceid');
    expect(status?.primaryNameAttribute).toBe('cr664_name');
    expect(status?.selectorFields).toContain('cr664_code');
    expect(status?.selectorFields).toContain('cr664_activeflag');
  });

  it('points at the read-only inspect command as its source', () => {
    expect(NEW_DEAL_REFERENCE_TARGETS_SOURCE_COMMAND).toBe(
      'node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references',
    );
    expect(NEW_DEAL_REFERENCE_TARGETS_CONFIRMED_ON).toBe('2026-06-15');
  });

  it('states identified-but-not-registered posture: no resolver, no create', () => {
    expect(NEW_DEAL_REFERENCE_TARGETS_IDENTIFIED).toBe(true);
    expect(NEW_DEAL_REFERENCE_TARGETS_REGISTERED).toBe(false);
    expect(NEW_DEAL_REFERENCE_RESOLVER_AVAILABLE).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
  });
});

describe('Phase 170D-R -- one canonical source feeds resolver + admin', () => {
  it('the resolver re-exports the canonical Stage/Status metadata (same objects)', () => {
    // The resolver imports these from this canonical module and re-exports
    // them, so identity must be preserved -- not a parallel copy.
    expect(RESOLVER_STAGE_REFERENCE).toBe(STAGE_REFERENCE);
    expect(RESOLVER_STATUS_REFERENCE).toBe(STATUS_REFERENCE);
  });

  it('the resolver projection is derived from the same canonical targets', () => {
    const stage = NEW_DEAL_REFERENCE_TARGETS.find((t) => t.label === 'Stage')!;
    const status = NEW_DEAL_REFERENCE_TARGETS.find((t) => t.label === 'Status')!;
    expect(STAGE_REFERENCE.entitySetName).toBe(stage.targetEntitySetName);
    expect(STAGE_REFERENCE.logicalName).toBe(stage.targetTableLogicalName);
    expect(STAGE_REFERENCE.primaryId).toBe(stage.primaryIdAttribute);
    expect(STAGE_REFERENCE.bindAttribute).toBe(stage.odataBindKey);
    expect(STATUS_REFERENCE.entitySetName).toBe(status.targetEntitySetName);
    expect(STATUS_REFERENCE.bindAttribute).toBe(status.odataBindKey);
  });
});

describe('Phase 170D -- target manifest source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'newDealReferenceTargets.ts'), 'utf8');

  it('hardcodes no Dataverse GUID (metadata names only)', () => {
    expect(SRC).not.toMatch(
      /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
    );
  });

  it('introduces no fetch / XHR / Graph / Dataverse write or create', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    // Static data only: imports no generated service.
    expect(SRC).not.toMatch(/^import .*Service/im);
  });

  it('fabricates no Stage or Status default value', () => {
    expect(SRC).not.toMatch(/initial review|underwriting|active phase|test stage/i);
    expect(SRC).not.toMatch(/test status|active status|in progress status/i);
  });
});
