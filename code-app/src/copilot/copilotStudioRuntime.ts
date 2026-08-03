import { MicrosoftCopilotStudioService } from '../generated/services/MicrosoftCopilotStudioService';

export const OGB_COPILOT_SCHEMA_NAME = 'cr664_OGBGovernedLendingCopilot';
export const OGB_POWER_PLATFORM_ENVIRONMENT_ID = '5f2d77a5-de50-edeb-9d74-5b2400a2320d';

interface CopilotStudioResponseData {
  lastResponse?: unknown;
  LastResponse?: unknown;
  responses?: unknown;
  Responses?: unknown;
}

function responseText(data: CopilotStudioResponseData | undefined): string | undefined {
  if (!data) return undefined;
  const last = data.lastResponse ?? data.LastResponse;
  if (typeof last === 'string' && last.trim()) return last.trim();
  const responses = data.responses ?? data.Responses;
  if (Array.isArray(responses)) {
    const values = responses.filter((value): value is string => typeof value === 'string' && !!value.trim());
    if (values.length) return values.join('\n').trim();
  }
  return undefined;
}

/** Invokes the published agent through the generated, Entra-authenticated Power Apps connector. */
export async function invokeOgbGovernedLendingCopilot(message: string): Promise<string> {
  const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
    OGB_COPILOT_SCHEMA_NAME,
    { notificationUrl: 'https://notificationurlplaceholder', message, locale: 'en-US' },
    undefined,
    OGB_POWER_PLATFORM_ENVIRONMENT_ID,
  );
  if (result.success === false) {
    throw new Error(result.error?.message ?? 'Microsoft Copilot Studio did not accept the request.');
  }
  const data = (result as unknown as { data?: CopilotStudioResponseData }).data;
  return responseText(data) ?? 'The agent accepted the request but returned no text response.';
}
