export class NotProvisionedError extends Error {
  readonly upn: string;
  constructor(upn: string) {
    super(`No LOS profile is provisioned for ${upn}.`);
    this.name = 'NotProvisionedError';
    this.upn = upn;
  }
}

export class UnresolvedWorkspaceError extends Error {
  readonly workspaceName: string | undefined;
  constructor(workspaceName: string | undefined) {
    super(
      workspaceName
        ? `Workspace "${workspaceName}" is not a recognized landing target.`
        : 'No primary workspace assigned.',
    );
    this.name = 'UnresolvedWorkspaceError';
    this.workspaceName = workspaceName;
  }
}
