export interface GraphParentReference {
  readonly driveId: string;
  readonly id: string;
  readonly path: string;
}

export interface GraphDriveItem {
  readonly id: string;
  readonly name: string;
  readonly webUrl: string;
  readonly size: number;
  readonly parentReference?: GraphParentReference;
  readonly folder?: Readonly<Record<string, unknown>>;
  readonly file?: { readonly mimeType?: string };
}

export interface GraphSiteReadback { readonly id: string; readonly webUrl: string }
export interface GraphDriveReadback { readonly id: string; readonly webUrl: string; readonly listId?: string }

/** Narrow server-only Graph seam. Implementations obtain tokens outside browser code. */
export interface SharePointGraphClient {
  readSite(siteId: string): Promise<GraphSiteReadback | undefined>;
  readDrive(driveId: string): Promise<GraphDriveReadback | undefined>;
  readItem(driveId: string, itemId: string): Promise<GraphDriveItem | undefined>;
  findChildByExactName(driveId: string, parentItemId: string, exactName: string): Promise<GraphDriveItem | undefined>;
  createFolder(input: { readonly driveId: string; readonly parentItemId: string; readonly name: string; readonly conflictBehavior: 'fail' }): Promise<GraphDriveItem>;
  uploadFile(input: { readonly driveId: string; readonly parentItemId: string; readonly name: string; readonly mimeType: string; readonly content: Uint8Array; readonly conflictBehavior: 'fail' }): Promise<GraphDriveItem>;
}

export class GraphCollisionError extends Error {
  constructor(message = 'Microsoft Graph reported a name collision.') { super(message); this.name = 'GraphCollisionError'; }
}
