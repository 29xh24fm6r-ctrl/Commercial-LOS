import {
  CREDIT_INTELLIGENCE_CUSTOM_API_NAME,
  type CreditIntelligenceCustomApiCommand,
} from './creditIntelligenceCustomApiHandler';
import type { CreditIntelligenceResult } from './creditIntelligence';

/** Platform-managed Dataverse invocation; no URL, token, or model credential enters the browser module. */
export interface PowerAppsCustomApiClient {
  executeCustomApi(name: string, payload: Readonly<Record<string, unknown>>): Promise<unknown>;
}

function isResult(value: unknown): value is CreditIntelligenceResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CreditIntelligenceResult>;
  if (candidate.status !== 'complete' && candidate.status !== 'blocked') return false;
  return typeof candidate.correlationId === 'string' && typeof candidate.tool === 'string' && Array.isArray(candidate.auditEventIds);
}

export interface CreditIntelligenceTransport {
  invoke(command: CreditIntelligenceCustomApiCommand): Promise<CreditIntelligenceResult>;
}

export function createCreditIntelligenceDataverseTransport(
  client: PowerAppsCustomApiClient,
): CreditIntelligenceTransport {
  return {
    async invoke(command) {
      try {
        const raw = await client.executeCustomApi(CREDIT_INTELLIGENCE_CUSTOM_API_NAME, {
          correlationId: command.correlationId,
          requestedAt: command.requestedAt,
          tool: command.tool,
          bankId: command.bankId,
          dealId: command.dealId,
          partyIds: [...command.partyIds],
          requestedSourceIds: [...command.requestedSourceIds],
          question: command.question,
          governanceEvaluationId: command.governanceEvaluationId,
          // authenticatedSystemUserId is deliberately omitted: the Custom API
          // host obtains it from the Dataverse execution context.
        });
        if (isResult(raw) && raw.correlationId === command.correlationId && raw.tool === command.tool) return raw;
        return {
          status: 'blocked',
          correlationId: command.correlationId,
          tool: command.tool,
          code: 'UNSAFE_OUTPUT',
          safeMessage: 'The Dataverse intelligence response was malformed or did not match the request.',
          auditEventIds: [],
        };
      } catch {
        return {
          status: 'blocked',
          correlationId: command.correlationId,
          tool: command.tool,
          code: 'SOURCE_UNAVAILABLE',
          safeMessage: 'The governed Dataverse intelligence service is unavailable.',
          auditEventIds: [],
        };
      }
    },
  };
}
