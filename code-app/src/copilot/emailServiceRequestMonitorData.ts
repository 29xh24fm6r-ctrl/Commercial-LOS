import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

export interface EmailServiceRequestMonitorRow {
  readonly id: string;
  readonly subject: string;
  readonly senderAddress: string;
  readonly receivedAt: string;
  readonly category: string;
  readonly confidence: number;
  readonly status: 'TRIAGE_REQUIRED' | 'TASK_CREATED' | 'BLOCKED' | 'IGNORED' | string;
  readonly statusReason: string;
}

export type EmailServiceRequestMonitorLoader = (
  assigneeSystemUserId: string,
) => Promise<readonly EmailServiceRequestMonitorRow[]>;

export function rowsFromEmailServiceRequestResult(value: unknown): readonly EmailServiceRequestMonitorRow[] {
  const result = value as { success?: boolean; data?: unknown; error?: { message?: string } };
  if (result.success === false) throw new Error(result.error?.message ?? 'Email intake query failed.');
  const rows = Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
  return rows.map(row => ({
    id: String(row.cr664_emailservicerequestintakeid ?? ''),
    subject: String(row.cr664_subject ?? ''),
    senderAddress: String(row.cr664_senderaddress ?? ''),
    receivedAt: String(row.cr664_receivedat ?? ''),
    category: String(row.cr664_category ?? ''),
    confidence: Number(row.cr664_confidence ?? 0),
    status: String(row.cr664_status ?? ''),
    statusReason: String(row.cr664_statusreason ?? ''),
  }));
}

export const loadEmailServiceRequestMonitorRows: EmailServiceRequestMonitorLoader = async assigneeSystemUserId => {
  const { getClient } = await import('@microsoft/power-apps/data');
  const result = await getClient(dataSourcesInfo).retrieveMultipleRecordsAsync<Record<string, unknown>>(
    'cr664_emailservicerequestintakes',
    {
      select: [
        'cr664_emailservicerequestintakeid', 'cr664_subject', 'cr664_senderaddress',
        'cr664_receivedat', 'cr664_category', 'cr664_confidence', 'cr664_status', 'cr664_statusreason',
      ],
      filter: `_cr664_assignee_value eq ${assigneeSystemUserId} and cr664_status ne 'IGNORED'`,
      orderBy: ['cr664_receivedat desc'],
      top: 25,
    },
  );
  return rowsFromEmailServiceRequestResult(result);
};
