import { useEffect, useState } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { adminStyles, formatDate } from './adminCardChrome';
import { loadTestDataSnapshot, type TestDataSnapshot } from './adminTestDataQueries';

/**
 * PR 104 -- the "labeled test-data view" every operational surface's
 * exclusion policy has assumed exists but nothing built: an admin-only place
 * to see which deals classification treats as SYSTEM-TEST/SMOKE/QA/DEMO (and
 * therefore excludes from Banker/Manager/Executive KPIs), by which naming
 * rule, without needing to know Dataverse query syntax. Test records are
 * never deleted or hidden here -- only labeled.
 */

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: TestDataSnapshot }
  | { readonly kind: 'failed'; readonly message: string };

const PREVIEW_LIMIT = 25;

export function TestDataView({ loader = loadTestDataSnapshot }: { loader?: () => Promise<TestDataSnapshot> }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loader()
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'failed', message: err instanceof Error ? err.message : 'Failed to load test-data classification.' });
      });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  return (
    <Card>
      <CardHeader
        title="Test Data"
        subtitle={state.kind === 'ready' ? `${state.data.testRows.length} classified as test/smoke` : undefined}
      />
      <Body state={state} />
    </Card>
  );
}

function Body({ state }: { state: LoadState }) {
  if (state.kind === 'loading') return <p style={adminStyles.muted}>Loading deal classification…</p>;
  if (state.kind === 'failed') {
    return (
      <div style={adminStyles.errorBox} role="alert">
        <div style={adminStyles.errorTitle}>Could not load test-data classification</div>
        <div style={adminStyles.errorDetail}>{state.message}</div>
      </div>
    );
  }
  const { operationalCount, testRows } = state.data;
  if (testRows.length === 0) {
    return <p style={adminStyles.muted}>No deals match the test/smoke naming convention. {operationalCount} operational deal{operationalCount === 1 ? '' : 's'}.</p>;
  }
  const preview = testRows.slice(0, PREVIEW_LIMIT);
  const overflow = testRows.length - preview.length;
  return (
    <>
      <div style={adminStyles.grid}>
        <div style={adminStyles.stat}>
          <span style={adminStyles.statLabel}>Operational deals</span>
          <span style={adminStyles.statValue}>{operationalCount}</span>
        </div>
        <div style={adminStyles.stat}>
          <span style={adminStyles.statLabel}>Test / smoke deals</span>
          <span style={adminStyles.statValue}>{testRows.length}</span>
        </div>
      </div>
      <ul style={adminStyles.list} data-admin-test-data-rows>
        {preview.map((r) => (
          <li key={r.id} style={adminStyles.row} data-admin-test-data-row={r.id}>
            <div style={adminStyles.rowHead}>
              <span style={adminStyles.rowTitle}>{r.name}</span>
              <Badge variant="neutral" appearance="outline">TEST</Badge>
            </div>
            <div style={adminStyles.rowMeta}>
              <span><span style={adminStyles.metaLabel}>Stage:</span> {r.stage ?? '—'}</span>
              <span><span style={adminStyles.metaLabel}>Created:</span> {formatDate(r.createdOn) ?? '—'}</span>
            </div>
          </li>
        ))}
      </ul>
      <CardFooter>
        <span>Classified by shared/deals/testDealClassification.ts (naming convention: SYSTEM TEST -, [SMOKE TEST], [QA], [DEMO], and similar tags/phrases).</span>
        {overflow > 0 && <span>+ {overflow} more not shown.</span>}
      </CardFooter>
    </>
  );
}
