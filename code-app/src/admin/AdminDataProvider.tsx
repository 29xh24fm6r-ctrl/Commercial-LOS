import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  loadOpenDataQualityFlags,
  loadAuditAnomalies,
  loadOpenAlerts,
  loadLatestRefreshStatus,
  loadConfigurationOverview,
  type DataQualityFlagRow,
  type AuditAnomalyRow,
  type AlertRow,
  type RefreshStatusSummary,
  type ConfigurationSnapshot,
} from './adminDiagnosticsQueries';

export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

/** Keys callers pass to refresh() to reload one diagnostic without a
 *  global refetch storm. The 'after-resolve' bundle is the targeted
 *  reload used by Phase-18 writes — flag list + audit anomalies. */
export type AdminDataKey =
  | 'dataQuality'
  | 'auditAnomalies'
  | 'alerts'
  | 'refreshStatus'
  | 'configuration'
  | 'after-resolve';

export interface AdminData {
  dataQuality: AsyncResult<DataQualityFlagRow[]>;
  auditAnomalies: AsyncResult<AuditAnomalyRow[]>;
  alerts: AsyncResult<AlertRow[]>;
  refreshStatus: AsyncResult<RefreshStatusSummary | null>;
  configuration: AsyncResult<ConfigurationSnapshot>;
  refresh: (key: AdminDataKey) => void;
}

const AdminDataContext = createContext<AdminData | null>(null);

export function useAdminData(): AdminData {
  const ctx = useContext(AdminDataContext);
  if (!ctx) {
    throw new Error('useAdminData must be used inside <AdminDataProvider>.');
  }
  return ctx;
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [dataQuality, setDataQuality] = useState<AsyncResult<DataQualityFlagRow[]>>({
    kind: 'loading',
  });
  const [auditAnomalies, setAuditAnomalies] = useState<AsyncResult<AuditAnomalyRow[]>>({
    kind: 'loading',
  });
  const [alerts, setAlerts] = useState<AsyncResult<AlertRow[]>>({ kind: 'loading' });
  const [refreshStatus, setRefreshStatus] = useState<
    AsyncResult<RefreshStatusSummary | null>
  >({ kind: 'loading' });
  const [configuration, setConfiguration] = useState<AsyncResult<ConfigurationSnapshot>>({
    kind: 'loading',
  });

  // Used by the unmount cleanup AND by refresh() so a refresh fired
  // after unmount cannot late-write into stale state. Lives on a ref
  // so it's stable across renders.
  const cancelledRef = useRef(false);

  function bind<T>(setter: (r: AsyncResult<T>) => void, promise: Promise<T>): void {
    promise
      .then((data) => {
        if (!cancelledRef.current) setter({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setter({ kind: 'failed', message });
      });
  }

  function reloadDataQuality(): void {
    setDataQuality({ kind: 'loading' });
    bind(setDataQuality, loadOpenDataQualityFlags());
  }
  function reloadAuditAnomalies(): void {
    setAuditAnomalies({ kind: 'loading' });
    bind(setAuditAnomalies, loadAuditAnomalies());
  }
  function reloadAlerts(): void {
    setAlerts({ kind: 'loading' });
    bind(setAlerts, loadOpenAlerts());
  }
  function reloadRefreshStatus(): void {
    setRefreshStatus({ kind: 'loading' });
    bind(setRefreshStatus, loadLatestRefreshStatus());
  }
  function reloadConfiguration(): void {
    setConfiguration({ kind: 'loading' });
    bind(setConfiguration, loadConfigurationOverview());
  }

  // Initial load.
  useEffect(() => {
    cancelledRef.current = false;
    reloadDataQuality();
    reloadAuditAnomalies();
    reloadAlerts();
    reloadRefreshStatus();
    reloadConfiguration();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback((key: AdminDataKey) => {
    switch (key) {
      case 'dataQuality':
        reloadDataQuality();
        break;
      case 'auditAnomalies':
        reloadAuditAnomalies();
        break;
      case 'alerts':
        reloadAlerts();
        break;
      case 'refreshStatus':
        reloadRefreshStatus();
        break;
      case 'configuration':
        reloadConfiguration();
        break;
      case 'after-resolve':
        // Targeted reload after Phase-18 resolve: just the two cards
        // the write affects. No global refresh storm.
        reloadDataQuality();
        reloadAuditAnomalies();
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminDataContext.Provider
      value={{ dataQuality, auditAnomalies, alerts, refreshStatus, configuration, refresh }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}
