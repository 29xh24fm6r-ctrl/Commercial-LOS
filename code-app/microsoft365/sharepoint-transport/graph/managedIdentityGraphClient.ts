import { GraphCollisionError, type GraphDriveItem, type GraphDriveReadback, type GraphSiteReadback, type SharePointGraphClient } from './graphClient.js';

export interface GraphAccessTokenProvider { getToken(scope: 'https://graph.microsoft.com/.default'): Promise<{ readonly token: string } | null> }
export type GraphFetch = (input: string, init?: RequestInit) => Promise<Response>;

const graphBase = 'https://graph.microsoft.com/v1.0';
const encodeName = (value: string) => encodeURIComponent(value).replace(/%2F/gi, '%252F');

export class ManagedIdentitySharePointGraphClient implements SharePointGraphClient {
  constructor(private readonly credentials: GraphAccessTokenProvider, private readonly fetcher: GraphFetch = fetch) {}

  readSite(siteId: string): Promise<GraphSiteReadback | undefined> { return this.get(`/sites/${encodeURIComponent(siteId)}`); }
  async readDrive(driveId: string): Promise<GraphDriveReadback | undefined> {
    const drive = await this.get<{ id?: string; webUrl?: string; list?: { id?: string } }>(`/drives/${encodeURIComponent(driveId)}?$select=id,webUrl,list`);
    if (!drive?.id || !drive.webUrl) return undefined;
    return { id: drive.id, webUrl: drive.webUrl, listId: drive.list?.id };
  }
  readItem(driveId: string, itemId: string): Promise<GraphDriveItem | undefined> { return this.get(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`); }

  async findChildByExactName(driveId: string, parentItemId: string, exactName: string): Promise<GraphDriveItem | undefined> {
    const result = await this.get<{ value?: GraphDriveItem[] }>(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}/children?$select=id,name,webUrl,size,parentReference,folder,file`);
    const matches = result?.value?.filter((item) => item.name === exactName) ?? [];
    if (matches.length > 1) throw new Error('GRAPH_EXACT_NAME_AMBIGUOUS');
    return matches[0];
  }

  createFolder(input: { driveId: string; parentItemId: string; name: string; conflictBehavior: 'fail' }): Promise<GraphDriveItem> {
    return this.request(`/drives/${encodeURIComponent(input.driveId)}/items/${encodeURIComponent(input.parentItemId)}/children`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: input.name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
  }

  async uploadFile(input: { driveId: string; parentItemId: string; name: string; mimeType: string; content: Uint8Array; conflictBehavior: 'fail' }): Promise<GraphDriveItem> {
    const existing = await this.findChildByExactName(input.driveId, input.parentItemId, input.name);
    if (existing) throw new GraphCollisionError();
    const session = await this.request<{ uploadUrl?: string }>(`/drives/${encodeURIComponent(input.driveId)}/items/${encodeURIComponent(input.parentItemId)}:/${encodeName(input.name)}:/createUploadSession`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'fail', name: input.name, fileSystemInfo: {} } }),
    });
    if (!session.uploadUrl || !session.uploadUrl.startsWith('https://')) throw new Error('GRAPH_UPLOAD_SESSION_INVALID');
    const response = await this.fetcher(session.uploadUrl, { method: 'PUT', headers: { 'content-length': String(input.content.byteLength), 'content-range': `bytes 0-${input.content.byteLength - 1}/${input.content.byteLength}`, 'content-type': input.mimeType }, body: input.content as unknown as BodyInit });
    return this.readResponse<GraphDriveItem>(response);
  }

  private async get<T>(path: string): Promise<T | undefined> {
    const token = await this.token();
    const response = await this.fetcher(`${graphBase}${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (response.status === 404) return undefined;
    return this.readResponse<T>(response);
  }
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.token();
    const response = await this.fetcher(`${graphBase}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
    return this.readResponse<T>(response);
  }
  private async token(): Promise<string> { const value = await this.credentials.getToken('https://graph.microsoft.com/.default'); if (!value?.token) throw new Error('MANAGED_IDENTITY_TOKEN_UNAVAILABLE'); return value.token; }
  private async readResponse<T>(response: Response): Promise<T> {
    if (response.status === 409 || response.status === 412) throw new GraphCollisionError();
    if (!response.ok) throw new Error(`GRAPH_REQUEST_FAILED_${response.status}`);
    const value = await response.json() as T;
    if (!value || typeof value !== 'object') throw new Error('GRAPH_RESPONSE_MALFORMED');
    return value;
  }
}
