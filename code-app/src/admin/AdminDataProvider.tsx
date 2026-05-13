import { createContext, useContext, useEffect, useState } from 'react';
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

export interface AdminData {
  dataQuality: AsyncResult<DataQualityFlagRow[]>;
  auditAnomalies: AsyncResult<AuditAnomalyRow[]>;
  alerts: AsyncResult<AlertRow[]>;
  refreshStatus: AsyncResult<RefreshStatusSummary | null>;
  configuration: AsyncResult<ConfigurationSnapshot>;
}

const AdminDataContext = createContext<AdminData | null>(null);

export function useAdminData(): AdminData {
  const ctx = useContext(AdminDataContext);
  if (!ctx) {
    throw new Error('useAdminData must be used inside <AdminDataProvider>.');
  }
  return ctx;
}

/**
 * Admin diagnostic data provider. Five parallel diagnostic loads. The
 * 'System Health Summary' card synthesizes severity from this context;
 * no separate query for it.
 */
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

    bind(setDataQuality, loadOpenDataQualityFlags());
    bind(setAuditAnomalies, loadAuditAnomalies());
    bind(setAlerts, loadOpenAlerts());
    bind(setRefreshStatus, loadLatestRefreshStatus());
    bind(setConfiguration, loadConfigurationOverview());

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminDataContext.Provider
      value={{ dataQuality, auditAnomalies, alerts, refreshStatus, configuration }}
    >
      {children}
    </AdminDataContext.Provider>
  );
}
