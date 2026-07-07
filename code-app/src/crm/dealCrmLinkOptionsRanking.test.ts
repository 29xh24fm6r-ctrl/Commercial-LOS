import { describe, it, expect } from 'vitest';
import {
  rankLinkOptions,
  MIN_SEARCH_CHARS,
  LINK_OPTION_RESULT_CAP,
  CLIENT_GROUP_TITLE,
  ORG_GROUP_TITLE,
} from './dealCrmLinkOptionsRanking';
import type { CrmLinkOption } from './dealCrmLinkOptions';

/**
 * Scalable Link CRM client ranking.
 *
 * Pins the behaviors that keep the modal usable as the CRM grows:
 *   - an empty/short query never renders the whole list;
 *   - deal-name suggestions surface relevant clients/companies by default;
 *   - a >= 2-char search ranks exact → starts-with → contains, capped;
 *   - client results group into "Existing CRM Client" + the company bridge group.
 */

function client(name: string, over: Partial<CrmLinkOption> = {}): CrmLinkOption {
  return { id: `c-${name}`, name, active: true, sourceKind: 'clientrelationship', ...over };
}
function org(name: string, over: Partial<CrmLinkOption> = {}): CrmLinkOption {
  return { id: `o-${name}`, name, active: true, sourceKind: 'organization', sublabel: ORG_GROUP_TITLE, ...over };
}

describe('rankLinkOptions — no full list by default', () => {
  it('an empty query with no matching deal name shows the prompt, not the list', () => {
    const options = Array.from({ length: 50 }, (_, i) => client(`Company ${i}`));
    const r = rankLinkOptions({ options, dealName: 'Zzz Unrelated Deal', query: '', targetKind: 'client' });
    expect(r.mode).toBe('prompt');
    expect(r.visibleCount).toBe(0);
    expect(r.groups).toEqual([]);
  });

  it('a 1-character query still does not run a general search', () => {
    const options = [client('Acme Holdings'), client('Apex Metals')];
    const r = rankLinkOptions({ options, dealName: '', query: 'a', targetKind: 'client' });
    expect(MIN_SEARCH_CHARS).toBe(2);
    expect(r.mode).toBe('prompt');
    expect(r.visibleCount).toBe(0);
  });
});

describe('rankLinkOptions — deal-name suggestions', () => {
  it('suggests a client/company matching the deal name (shared leading token)', () => {
    const options = [
      client('Acme Holdings LLC'),
      client('Beta Foods Inc'),
      org('Acme Robotics'),
    ];
    const r = rankLinkOptions({ options, dealName: 'Acme Term Loan', query: '', targetKind: 'client' });
    expect(r.mode).toBe('suggestions');
    const names = r.groups.flatMap((g) => g.options.map((o) => o.name));
    expect(names).toContain('Acme Holdings LLC');
    expect(names).toContain('Acme Robotics');
    expect(names).not.toContain('Beta Foods Inc');
  });

  it('ranks an exact deal-name match above a starts-with / contains one', () => {
    const options = [
      client('OmniCare 365 Holdings'), // contains
      client('OmniCare 365'), // exact
      client('OmniCare 365 Working Capital extra'), // starts-with-ish
    ];
    const r = rankLinkOptions({ options, dealName: 'OmniCare 365', query: '', targetKind: 'client' });
    expect(r.groups[0].options[0].name).toBe('OmniCare 365');
  });
});

describe('rankLinkOptions — general search (>= 2 chars), ranked + capped', () => {
  it('ranks exact above starts-with above contains', () => {
    const options = [
      client('Beta Acme Corp'), // contains "acme"
      client('Acme Holdings'), // starts-with "acme"
      client('Acme'), // exact "acme"
    ];
    const r = rankLinkOptions({ options, dealName: '', query: 'acme', targetKind: 'client' });
    expect(r.mode).toBe('search');
    expect(r.groups.flatMap((g) => g.options.map((o) => o.name))).toEqual([
      'Acme',
      'Acme Holdings',
      'Beta Acme Corp',
    ]);
  });

  it('caps visible results and flags that more exist', () => {
    const options = Array.from({ length: 30 }, (_, i) => client(`Acme ${String(i).padStart(2, '0')}`));
    const r = rankLinkOptions({ options, dealName: '', query: 'acme', targetKind: 'client', cap: 20 });
    expect(LINK_OPTION_RESULT_CAP).toBe(20);
    expect(r.totalCount).toBe(30);
    expect(r.visibleCount).toBe(20);
    expect(r.hasMore).toBe(true);
  });

  it('excludes non-matches', () => {
    const options = [client('Acme'), client('Zenith')];
    const r = rankLinkOptions({ options, dealName: '', query: 'acme', targetKind: 'client' });
    expect(r.totalCount).toBe(1);
    expect(r.hasMore).toBe(false);
  });
});

describe('rankLinkOptions — grouping', () => {
  it('groups client target results into Existing CRM Client + company bridge group', () => {
    const options = [client('Acme Holdings'), org('Acme Robotics')];
    const r = rankLinkOptions({ options, dealName: '', query: 'acme', targetKind: 'client' });
    expect(r.groups.map((g) => g.title)).toEqual([CLIENT_GROUP_TITLE, ORG_GROUP_TITLE]);
    expect(r.groups[0].options[0].sourceKind).not.toBe('organization');
    expect(r.groups[1].options[0].sourceKind).toBe('organization');
  });

  it('team target is a single ungrouped list', () => {
    const options = [
      { id: 't1', name: 'Commercial East', active: true },
      { id: 't2', name: 'Commercial West', active: true },
    ];
    const r = rankLinkOptions({ options, dealName: '', query: 'comm', targetKind: 'team' });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].title).toBeUndefined();
    expect(r.groups[0].options).toHaveLength(2);
  });
});
