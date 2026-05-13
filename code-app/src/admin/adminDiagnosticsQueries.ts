import { Cr664_dataqualityflagsService } from '../generated/services/Cr664_dataqualityflagsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_alertqueuesService } from '../generated/services/Cr664_alertqueuesService';
import { Cr664_systemsettingsService } from '../generated/services/Cr664_systemsettingsService';
import { Cr664_kpithresholdconfigurationsService } from '../generated/services/Cr664_kpithresholdconfigurationsService';
import { Cr664_profitabilityrefreshstatusesService } from '../generated/services/Cr664_profitabilityrefreshstatusesService';

/**
 * Admin Workspace diagnostics. Read-only. Each query targets an
 * existing diagnostic entity and returns either parsed rows or
 * aggregate counts the cards can render. The 'System Health Summary'
 * card synthesizes severity from the other queries via context — no
 * separate query for the summary.
 *
 * Severity discipline (consistent with the rest of the app):
 *   Critical  -> red       (true blockers / SLA breaches / denials)
 *   Warning   -> amber     (open issues / stale data / unassigned)
 *   Healthy   -> green     (no signals)
 *   NotWired  -> neutral   (no schema yet — render honest state)
 *
 * Filters are server-side. We avoid full-table scans where possible
 * by filtering on resolved/closed states and ordering by date so the
 * UI can show top-N urgent items.
 */

// ---------------------------------------------------------------------------
// Data Quality Flags
// ---------------------------------------------------------------------------

const DQ_STATUS_OPEN = 788190000;

export type DataQualityResolutionKey = 'Open' | 'Resolved' | 'Ignored';

export interface DataQualityFlagRow {
  id: string;
  flagName: string;
  flagDescription: string | undefined;
  flagType: string | undefined;
  resolutionStatus: string | undefined;
  flaggedDate: string | undefined;
  sourceTable: string | undefined;
  sourceRecordId: string | undefined;
}

export async function loadOpenDataQualityFlags(): Promise<DataQualityFlagRow[]> {
  const result = await Cr664_dataqualityflagsService.getAll({
    filter: [
      `cr664_resolutionstatus eq ${DQ_STATUS_OPEN}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_flaggeddate desc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load data quality flags');
  }
  return (result.data ?? []).map(
    (r): DataQualityFlagRow => ({
      id: r.cr664_dataqualityflagid,
      flagName: r.cr664_flagname,
      flagDescription: r.cr664_flagdescription,
      flagType: r.cr664_flagtypename,
      resolutionStatus: r.cr664_resolutionstatusname,
      flaggedDate: r.cr664_flaggeddate,
      sourceTable: r.cr664_sourcetable,
      sourceRecordId: r.cr664_sourcerecordid,
    }),
  );
}

// ---------------------------------------------------------------------------
// Audit Anomalies (non-success outcomes)
// ---------------------------------------------------------------------------

const AUDIT_OUTCOME_SUCCEEDED = 788190000;

export type AuditOutcomeKey = 'Succeeded' | 'Failed' | 'Blocked' | 'Denied';

export interface AuditAnomalyRow {
  id: string;
  eventName: string;
  eventCategory: string | undefined;
  eventType: string | undefined;
  outcomeStatus: string | undefined;
  outcomeKey: AuditOutcomeKey | undefined;
  failureReason: string | undefined;
  actorUserName: string | undefined;
  changedDate: string | undefined;
  entityType: string | undefined;
  entityId: string | undefined;
  workspaceContext: string | undefined;
}

const AUDIT_OUTCOME_MAP: Record<number, AuditOutcomeKey> = {
  788190000: 'Succeeded',
  788190001: 'Failed',
  788190002: 'Blocked',
  788190003: 'Denied',
};

function lookupAuditOutcome(v: unknown): AuditOutcomeKey | undefined {
  if (typeof v === 'number') return AUDIT_OUTCOME_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return AUDIT_OUTCOME_MAP[Number(v)];
  return undefined;
}

/**
 * Audit events with non-Succeeded outcomes. Server-filtered, ordered
 * newest-first; top 100 to keep the executive-grade UI responsive.
 */
export async function loadAuditAnomalies(): Promise<AuditAnomalyRow[]> {
  const result = await Cr664_auditeventsService.getAll({
    filter: [
      `cr664_outcomestatus ne ${AUDIT_OUTCOME_SUCCEEDED}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_changeddate desc'],
    top: 100,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load audit anomalies');
  }
  return (result.data ?? []).map(
    (r): AuditAnomalyRow => ({
      id: r.cr664_auditeventid,
      eventName: r.cr664_auditeventname,
      eventCategory: r.cr664_eventcategoryname,
      eventType: r.cr664_eventtypename,
      outcomeStatus: r.cr664_outcomestatusname,
      outcomeKey: lookupAuditOutcome(r.cr664_outcomestatus),
      failureReason: r.cr664_failurereason,
      actorUserName: r.cr664_actorusername ?? r.cr664_changedbyname,
      changedDate: r.cr664_changeddate,
      entityType: r.cr664_entitytypename,
      entityId: r.cr664_entityid,
      workspaceContext: r.cr664_workspacecontextname,
    }),
  );
}

// ---------------------------------------------------------------------------
// Alert Backlog (active alerts only)
// ---------------------------------------------------------------------------

const ALERT_STATUS_RESOLVED = 788190003;
const ALERT_STATUS_CLOSED = 788190004;

export type AlertSeverityKey = 'Low' | 'Medium' | 'High' | 'Critical';

export interface AlertRow {
  id: string;
  alertName: string;
  alertStatus: string | undefined;
  severity: string | undefined;
  severityKey: AlertSeverityKey | undefined;
  priority: string | undefined;
  alertCategory: string | undefined;
  alertType: string | undefined;
  assignedToName: string | undefined;
  assignedToId: string | undefined;
  createdDate: string | undefined;
  dueDate: string | undefined;
  slaBreachDate: string | undefined;
  slaDueDate: string | undefined;
  escalationLevel: number | undefined;
}

const ALERT_SEVERITY_MAP: Record<number, AlertSeverityKey> = {
  788190000: 'Low',
  788190001: 'Medium',
  788190002: 'High',
  788190003: 'Critical',
};

function lookupAlertSeverity(v: unknown): AlertSeverityKey | undefined {
  if (typeof v === 'number') return ALERT_SEVERITY_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return ALERT_SEVERITY_MAP[Number(v)];
  return undefined;
}

export async function loadOpenAlerts(): Promise<AlertRow[]> {
  const result = await Cr664_alertqueuesService.getAll({
    filter: [
      `cr664_alertstatus ne ${ALERT_STATUS_RESOLVED}`,
      `cr664_alertstatus ne ${ALERT_STATUS_CLOSED}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_severity desc', 'cr664_createddate desc'],
    top: 200,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load alert backlog');
  }
  return (result.data ?? []).map(
    (r): AlertRow => ({
      id: r.cr664_alertqueueid,
      alertName: r.cr664_alertname,
      alertStatus: r.cr664_alertstatusname,
      severity: r.cr664_severityname,
      severityKey: lookupAlertSeverity(r.cr664_severity),
      priority: r.cr664_priorityname,
      alertCategory: r.cr664_alertcategoryname,
      alertType: r.cr664_alerttypename,
      assignedToName: r.cr664_assignedtoname,
      assignedToId: r._cr664_assignedto_value,
      createdDate: r.cr664_createddate,
      dueDate: r.cr664_duedate,
      slaBreachDate: r.cr664_slabreachdate,
      slaDueDate: r.cr664_sladuedate,
      escalationLevel: r.cr664_escalationlevel,
    }),
  );
}

// ---------------------------------------------------------------------------
// Refresh Status (latest)
// ---------------------------------------------------------------------------

export interface RefreshStatusSummary {
  id: string;
  lastRefreshDate: string;
  nextScheduledRefresh: string | undefined;
  refreshCadence: string | undefined;
  refreshStatusName: string;
  staleDataFlag: boolean;
  staleThresholdHours: number;
}

export async function loadLatestRefreshStatus(): Promise<RefreshStatusSummary | null> {
  const result = await Cr664_profitabilityrefreshstatusesService.getAll({
    filter: `statecode eq 0`,
    orderBy: ['cr664_lastrefreshdate desc'],
    top: 1,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load refresh status');
  }
  const r = result.data?.[0];
  if (!r) return null;
  return {
    id: r.cr664_profitabilityrefreshstatusid,
    lastRefreshDate: r.cr664_lastrefreshdate,
    nextScheduledRefresh: r.cr664_nextscheduledrefresh,
    refreshCadence: r.cr664_refreshcadencename,
    refreshStatusName: r.cr664_refreshstatusname,
    staleDataFlag: r.cr664_staledataflag === true,
    staleThresholdHours: r.cr664_staledatathresholdhours,
  };
}

// ---------------------------------------------------------------------------
// Configuration: SystemSetting + KPIThresholdConfiguration
// ---------------------------------------------------------------------------

export interface SystemSettingRow {
  id: string;
  settingName: string | undefined;
  kpiBaselineDate: string | undefined;
}

export interface KpiThresholdRow {
  id: string;
  name: string | undefined;
  code: string | undefined;
  description: string | undefined;
  effectiveDate: string | undefined;
  retiredDate: string | undefined;
  activeFlag: boolean;
  sortOrder: number | undefined;
}

export interface ConfigurationSnapshot {
  systemSettings: SystemSettingRow[];
  activeKpiThresholds: KpiThresholdRow[];
}

export async function loadConfigurationOverview(): Promise<ConfigurationSnapshot> {
  const [settingsResult, thresholdsResult] = await Promise.all([
    Cr664_systemsettingsService.getAll({
      filter: `statecode eq 0`,
      orderBy: ['cr664_settingname asc'],
    }),
    Cr664_kpithresholdconfigurationsService.getAll({
      filter: `statecode eq 0`,
      orderBy: ['cr664_sortorder asc', 'cr664_name asc'],
    }),
  ]);

  if (!settingsResult.success) {
    throw new Error(settingsResult.error?.message ?? 'Failed to load system settings');
  }
  if (!thresholdsResult.success) {
    throw new Error(thresholdsResult.error?.message ?? 'Failed to load KPI thresholds');
  }

  const systemSettings: SystemSettingRow[] = (settingsResult.data ?? []).map((s) => ({
    id: s.cr664_systemsettingid,
    settingName: s.cr664_settingname,
    kpiBaselineDate: s.cr664_kpibaselinedate,
  }));

  const activeKpiThresholds: KpiThresholdRow[] = (thresholdsResult.data ?? [])
    .map((t) => ({
      id: t.cr664_kpithresholdconfigurationid,
      name: t.cr664_name,
      code: t.cr664_code,
      description: t.cr664_description,
      effectiveDate: t.cr664_effectivedate,
      retiredDate: t.cr664_retireddate,
      activeFlag: t.cr664_activeflag === true,
      sortOrder: t.cr664_sortorder,
    }))
    .filter((t) => t.activeFlag && !t.retiredDate);

  return { systemSettings, activeKpiThresholds };
}
