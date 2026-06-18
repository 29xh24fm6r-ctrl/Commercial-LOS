// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { CrmSpineReadinessConsole } from './CrmSpineReadinessConsole';
import {
  CRM_SPINE_SCHEMA_BINDINGS,
  type CrmLiveTableSnapshot,
} from './crmSalesforceSpineSchemaAdapter';

/**
 * Phase 189L — CRM spine live readiness console rendering.
 *
 * Proves the console renders all 11 entities with present/partial/missing
 * status, shows the deterministic plan with executed:false, shows the seed mode
 * as disabled/inert, and exposes no write affordance.
 */

const ALL_ENTITIES = [
  'account',
  'contact',
  'accountContactRelationship',
  'relationshipRole',
  'coverageTeamMember',
  'dealRelationship',
  'activity',
  'task',
  'relationshipHealth',
  'sourceFact',
  'visibilityRequirement',
] as const;

function fullPresentSnapshot(entity: string): CrmLiveTableSnapshot {
  const b = CRM_SPINE_SCHEMA_BINDINGS.find((x) => x.entity === entity)!;
  return {
    logicalName: b.table!.logicalName,
    exists: true,
    presentColumns: b.columns.map((c) => c.logicalName),
    presentRelationships: b.relationships.map((r) => r.relationshipSchemaName),
  };
}

describe('console renders all 11 spine entities', () => {
  it('shows a row for every entity', () => {
    render(<CrmSpineReadinessConsole />);
    for (const e of ALL_ENTITIES) {
      expect(screen.getByTestId(`crm-spine-entity-${e}`)).toBeInTheDocument();
    }
    cleanup();
  });
});

describe('entity statuses reflect the live snapshot', () => {
  it('marks every spine table missing against an empty snapshot; derived/meta not-applicable', () => {
    render(<CrmSpineReadinessConsole snapshot={[]} />);
    for (const e of ['account', 'contact', 'task'] as const) {
      expect(screen.getByTestId(`crm-spine-entity-${e}`).getAttribute('data-entity-status')).toBe('missing');
    }
    for (const e of ['coverageTeamMember', 'sourceFact', 'visibilityRequirement'] as const) {
      expect(screen.getByTestId(`crm-spine-entity-${e}`).getAttribute('data-entity-status')).toBe('not-applicable');
    }
    cleanup();
  });

  it('marks a fully-present table present', () => {
    render(<CrmSpineReadinessConsole snapshot={[fullPresentSnapshot('account')]} />);
    expect(screen.getByTestId('crm-spine-entity-account').getAttribute('data-entity-status')).toBe('present');
    cleanup();
  });

  it('marks a table with missing columns partial', () => {
    render(
      <CrmSpineReadinessConsole
        snapshot={[{ logicalName: 'cr664_crmperson', exists: true, presentColumns: ['cr664_name'] }]}
      />,
    );
    expect(screen.getByTestId('crm-spine-entity-contact').getAttribute('data-entity-status')).toBe('partial');
    cleanup();
  });
});

describe('plan is displayed and marked not executed', () => {
  it('shows plan steps with executed:false', () => {
    render(<CrmSpineReadinessConsole snapshot={[]} />);
    const plan = screen.getByTestId('crm-spine-plan');
    expect(plan.getAttribute('data-plan-executed')).toBe('false');
    expect(Number(plan.getAttribute('data-plan-step-count'))).toBeGreaterThan(0);
    cleanup();
  });

  it('renders deterministically — identical plan text across renders', () => {
    render(<CrmSpineReadinessConsole snapshot={[]} />);
    const first = screen.getByTestId('crm-spine-plan').textContent;
    cleanup();
    render(<CrmSpineReadinessConsole snapshot={[]} />);
    const second = screen.getByTestId('crm-spine-plan').textContent;
    expect(second).toBe(first);
    cleanup();
  });
});

describe('seed mode is shown disabled / inert', () => {
  it('renders the seed block as not executed and gate not satisfied', () => {
    render(<CrmSpineReadinessConsole snapshot={[]} />);
    const seed = screen.getByTestId('crm-spine-seed');
    expect(seed.getAttribute('data-seed-executed')).toBe('false');
    expect(seed.getAttribute('data-seed-gate-satisfied')).toBe('false');
    expect(seed.textContent).toMatch(/not satisfied/i);
    cleanup();
  });
});

describe('no write affordance (read-only)', () => {
  it('renders no button, textbox, or form control', () => {
    render(<CrmSpineReadinessConsole snapshot={[]} />);
    const console_ = screen.getByTestId('crm-spine-readiness-console');
    expect(within(console_).queryByRole('button')).toBeNull();
    expect(within(console_).queryByRole('textbox')).toBeNull();
    // The footer states the read-only posture.
    expect(screen.getByTestId('crm-spine-readiness-footer').textContent).toMatch(/no Dataverse write/i);
    cleanup();
  });
});
