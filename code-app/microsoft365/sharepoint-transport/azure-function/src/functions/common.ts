import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { SharePointTransportOperation } from '../../../contract/types.js';
import { handleAuthenticatedTransportRequest } from '../../../host/httpHandler.js';
import { verifiedEasyAuthIdentity } from '../authenticationClaims.js';
import { loadRuntimeConfiguration } from '../runtimeConfiguration.js';
import { requireCertifiedProductionHost } from '../runtimeRegistry.js';

export async function invoke(operation: SharePointTransportOperation, request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const configuration = loadRuntimeConfiguration(process.env);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
    const identityContext = verifiedEasyAuthIdentity(headers, configuration.connectorIdentity);
    const response = await handleAuthenticatedTransportRequest(requireCertifiedProductionHost(), { operation, body: await request.json(), identityContext });
    const ok = Boolean(response && typeof response === 'object' && 'ok' in response && (response as { ok?: unknown }).ok === true);
    return { status: ok ? 200 : 409, jsonBody: response, headers: { 'cache-control': 'no-store', 'x-correlation-id': headers['x-correlation-id'] ?? '' } };
  } catch (error) {
    context.error('SharePoint transport blocked.', error instanceof Error ? error.name : 'UnknownError');
    return { status: 503, jsonBody: { ok: false, code: 'FAIL_CLOSED', reason: 'Authenticated SharePoint transport is unavailable.' }, headers: { 'cache-control': 'no-store' } };
  }
}
