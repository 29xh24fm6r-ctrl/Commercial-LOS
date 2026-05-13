import { createContext, useContext, useEffect, useState } from 'react';
import {
  loadProfitabilitySnapshots,
  loadDealReadinessSnapshots,
  loadPerformanceMetrics,
  loadLatestRefreshStatus,
  type ProfitabilitySnapshotRow,
  type DealReadinessSnapshotRow,
  type PerformanceMetricRow,
  type RefreshStatusRow,
} from './snapshotQueries';
import {
  loadPipelineByStageFallback,
  loadClosingForecastFallback,
  type StageAggregate,
  type MonthBucketAggregate,
} from './operationalFallbackQueries';

export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

/**
 * Executive workspace data shape. Two flavors of resource on this
 * context, both labeled in their key:
 *   - "snapshot" keys read governed snapshot entities
 *   - "fallback" keys read the operational fallback adapter
 *     (transitional, see operationalFallbackQueries.ts)
 *
 * Cards subscribe to the keys they need. There is intentionally no
 * cross-talk with ManagerDataProvider or DealDataProvider — the
 * executive surface is isolated.
 */
export interface ExecutiveData {
  snapshotProfitability: AsyncResult<ProfitabilitySnapshotRow[]>;
  snapshotReadiness: AsyncResult<DealReadinessSnapshotRow[]>;
  snapshotPerformance: AsyncResult<PerformanceMetricRow[]>;
  snapshotRefreshStatus: AsyncResult<RefreshStatusRow | null>;
  fallbackPipelineByStage: AsyncResult<StageAggregate[]>;
  fallbackClosingForecast: AsyncResult<MonthBucketAggregate[]>;
}

const ExecutiveDataContext = createContext<ExecutiveData | null>(null);

export function useExecutiveData(): ExecutiveData {
  const ctx = useContext(ExecutiveDataContext);
  if (!ctx) {
    throw new Error('useExecutiveData must be used inside <ExecutiveDataProvider>.');
  }
  return ctx;
}

export function ExecutiveDataProvider({ children }: { children: React.ReactNode }) {
  const [snapshotProfitability, setSnapshotProfitability] = useState<
    AsyncResult<ProfitabilitySnapshotRow[]>
  >({ kind: 'loading' });
  const [snapshotReadiness, setSnapshotReadiness] = useState<
    AsyncResult<DealReadinessSnapshotRow[]>
  >({ kind: 'loading' });
  const [snapshotPerformance, setSnapshotPerformance] = useState<
    AsyncResult<PerformanceMetricRow[]>
  >({ kind: 'loading' });
  const [snapshotRefreshStatus, setSnapshotRefreshStatus] = useState<
    AsyncResult<RefreshStatusRow | null>
  >({ kind: 'loading' });
  const [fallbackPipelineByStage, setFallbackPipelineByStage] = useState<
    AsyncResult<StageAggregate[]>
  >({ kind: 'loading' });
  const [fallbackClosingForecast, setFallbackClosingForecast] = useState<
    AsyncResult<MonthBucketAggregate[]>
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    function bind<T>(setter: (r: AsyncResult<T>) => void, promise: Promise<T>): void {
      promise
        .then((data) => {
          if (!cancelled) setter({ kind: 'ready', data });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          setter({ kind: 'failed', message });
        });
    }

    bind(setSnapshotProfitability, loadProfitabilitySnapshots());
    bind(setSnapshotReadiness, loadDealReadinessSnapshots());
    bind(setSnapshotPerformance, loadPerformanceMetrics());
    bind(setSnapshotRefreshStatus, loadLatestRefreshStatus());
    bind(setFallbackPipelineByStage, loadPipelineByStageFallback());
    bind(setFallbackClosingForecast, loadClosingForecastFallback());

    return () => {
      cancelled = true;
    };
  }, []);

  const value: ExecutiveData = {
    snapshotProfitability,
    snapshotReadiness,
    snapshotPerformance,
    snapshotRefreshStatus,
    fallbackPipelineByStage,
    fallbackClosingForecast,
  };

  return (
    <ExecutiveDataContext.Provider value={value}>{children}</ExecutiveDataContext.Provider>
  );
}
