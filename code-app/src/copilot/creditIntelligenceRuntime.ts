import type { CreditIntelligenceResult, CreditIntelligenceTool } from './creditIntelligence';
import { createCreditIntelligenceDataverseTransport } from './creditIntelligenceDataverseTransport';
import { createPowerAppsCreditIntelligenceClient } from './creditIntelligencePowerAppsClient';

export const DEAL_CREDIT_INTELLIGENCE_TOOLS = [
  'research_party',
  'build_credit_evidence_packet',
  'relationship_intelligence',
  'portfolio_monitoring',
] as const satisfies readonly CreditIntelligenceTool[];

export interface DealCreditIntelligenceRuntime {
  readonly enabledTools: readonly CreditIntelligenceTool[];
  run(tool: CreditIntelligenceTool): Promise<CreditIntelligenceResult>;
}

function runtimeBankId(): string | undefined {
  try {
    const value = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_COPILOT_BANK_ID?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function correlationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  throw new Error('A cryptographically generated correlation ID is required.');
}

/** Returns no runtime unless the institution identifier is explicitly deployed. */
export function createDealCreditIntelligenceRuntime(input: {
  readonly dealId: string;
  readonly partyIds: readonly string[];
  readonly bankId?: string;
}): DealCreditIntelligenceRuntime | undefined {
  const bankId = input.bankId?.trim() || runtimeBankId();
  if (!bankId || !input.dealId.trim()) return undefined;
  const transport = createCreditIntelligenceDataverseTransport(createPowerAppsCreditIntelligenceClient());
  return {
    enabledTools: DEAL_CREDIT_INTELLIGENCE_TOOLS,
    run(tool) {
      return transport.invoke({
        correlationId: correlationId(),
        requestedAt: new Date().toISOString(),
        authenticatedSystemUserId: 'resolved-by-dataverse',
        tool,
        bankId,
        dealId: input.dealId,
        partyIds: [...input.partyIds],
        requestedSourceIds: ['dataverse-los'],
      });
    },
  };
}
