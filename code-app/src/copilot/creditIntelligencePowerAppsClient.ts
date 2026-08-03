import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import type { PowerAppsCustomApiClient } from './creditIntelligenceDataverseTransport';

interface OperationEnvelope {
  readonly data?: unknown;
  readonly success?: boolean;
  readonly error?: { readonly message?: string };
}

function unwrapResultJson(value: unknown): unknown {
  const envelope = value as OperationEnvelope | undefined;
  if (envelope?.success === false) throw new Error(envelope.error?.message ?? 'Dataverse operation failed.');
  const body = (envelope?.data ?? value) as Record<string, unknown> | undefined;
  const serialized = body?.ResultJson ?? body?.resultJson;
  if (typeof serialized !== 'string') return body;
  return JSON.parse(serialized) as unknown;
}

/** Uses the Power Apps managed Dataverse connection; no token or endpoint is handled by app code. */
export function createPowerAppsCreditIntelligenceClient(): PowerAppsCustomApiClient {
  return {
    async executeCustomApi(name, payload) {
      const { getClient } = await import('@microsoft/power-apps/data');
      const client = getClient(dataSourcesInfo);
      const result = await client.executeAsync({
        dataverseRequest: {
          action: 'customapi',
          parameters: {
            operationName: name,
            tableName: '',
            body: payload,
          },
        },
      });
      return unwrapResultJson(result);
    },
  };
}

export const _test = { unwrapResultJson };
