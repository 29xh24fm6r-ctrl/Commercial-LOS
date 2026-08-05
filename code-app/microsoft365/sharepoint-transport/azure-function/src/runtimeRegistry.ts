import type { SharePointTransportHost } from '../../host/sharePointTransportHost.js';

let host: SharePointTransportHost | undefined;
export function registerCertifiedProductionHost(value: SharePointTransportHost): void {
  if (host) throw new Error('PRODUCTION_HOST_ALREADY_REGISTERED');
  host = value;
}
export function requireCertifiedProductionHost(): SharePointTransportHost {
  if (!host) throw new Error('PRODUCTION_HOST_UNAVAILABLE');
  return host;
}
