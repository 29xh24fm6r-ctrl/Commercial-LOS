import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Deal → CRM link option loaders (search / select existing only).
 *
 * Pins the two guarantees the "Link CRM client" modal depends on:
 *   - the client option loader reads from the registered
 *     `cr664_clientrelationships` datasource (the exact table the runtime
 *     failed to find), consistently across power.config.json, the generated
 *     service, and the generated dataSourcesInfo; and
 *   - it only PROJECTS existing Dataverse rows into options — it never creates
 *     a record and never fabricates a row when the store is empty.
 */

const getAllMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock('../generated/services/Cr664_clientrelationshipsService', () => ({
  Cr664_clientrelationshipsService: {
    getAll: getAllMock,
    // Present so the test can assert the loader never calls it.
    create: createMock,
  },
}));

const teamsGetAllMock = vi.hoisted(() => vi.fn());
vi.mock('../generated/services/Cr664_teamsService', () => ({
  Cr664_teamsService: { getAll: teamsGetAllMock },
}));

import { loadClientRelationshipOptions } from './dealCrmLinkOptions';

const HERE = dirname(fileURLToPath(import.meta.url));
const CODE_APP_ROOT = resolve(HERE, '../..');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dealCrmLinkOptions — client loader is registered against cr664_clientrelationships', () => {
  it('registers the clientrelationships datasource in power.config.json', () => {
    const config = JSON.parse(
      readFileSync(resolve(CODE_APP_ROOT, 'power.config.json'), 'utf8'),
    ) as {
      databaseReferences: {
        'default.cds': {
          dataSources: Record<string, { entitySetName: string; logicalName: string }>;
        };
      };
    };
    const ds = config.databaseReferences['default.cds'].dataSources.clientrelationships;
    expect(ds).toBeDefined();
    expect(ds.entitySetName).toBe('cr664_clientrelationships');
    expect(ds.logicalName).toBe('cr664_clientrelationship');
  });

  it('the generated service binds to the cr664_clientrelationships datasource name', () => {
    const src = readFileSync(
      resolve(CODE_APP_ROOT, 'src/generated/services/Cr664_clientrelationshipsService.ts'),
      'utf8',
    );
    expect(src).toContain("dataSourceName = 'cr664_clientrelationships'");
  });

  it('projects existing client relationship rows into options (no fabrication)', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        {
          cr664_clientrelationshipid: 'client-guid-1',
          cr664_clientname: 'Acme Holdings LLC',
          cr664_borrowertypename: 'LLC',
          cr664_industry: 'Manufacturing',
          statecode: 0,
        },
        {
          cr664_clientrelationshipid: 'client-guid-2',
          cr664_clientname: 'Beta Foods Inc',
          statecode: 1,
        },
      ],
    });

    const options = await loadClientRelationshipOptions();

    // Loads existing rows ordered by name; never creates a record.
    expect(getAllMock).toHaveBeenCalledTimes(1);
    expect(getAllMock.mock.calls[0][0]).toMatchObject({
      orderBy: ['cr664_clientname asc'],
    });
    expect(createMock).not.toHaveBeenCalled();

    expect(options).toEqual([
      {
        id: 'client-guid-1',
        name: 'Acme Holdings LLC',
        sublabel: 'LLC · Manufacturing',
        active: true,
      },
      {
        id: 'client-guid-2',
        name: 'Beta Foods Inc',
        sublabel: undefined,
        active: false,
      },
    ]);
  });

  it('returns an empty list for an empty store — never invents a placeholder client', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    const options = await loadClientRelationshipOptions();
    expect(options).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws (does not fabricate) when the datasource read fails', async () => {
    getAllMock.mockResolvedValue({
      success: false,
      error: { message: 'Unable to find data source: cr664_clientrelationships.' },
    });
    await expect(loadClientRelationshipOptions()).rejects.toThrow(/cr664_clientrelationships/);
    expect(createMock).not.toHaveBeenCalled();
  });
});
