export const WORKSPACE_ROUTES = {
  banker: '/workspaces/banker',
  team: '/workspaces/team',
  manager: '/workspaces/manager',
  executive: '/workspaces/executive',
  admin: '/workspaces/admin',
} as const;

export type WorkspaceKey = keyof typeof WORKSPACE_ROUTES;

const MATCHERS: Array<[WorkspaceKey, RegExp]> = [
  ['banker', /\bbanker\b/i],
  ['team', /\bteam\b/i],
  ['manager', /\bmanager\b/i],
  ['executive', /\b(executive|board)\b/i],
  ['admin', /\badmin\b/i],
];

export function resolveWorkspaceRoute(workspaceName: string | undefined): string | null {
  if (!workspaceName) return null;
  for (const [key, re] of MATCHERS) {
    if (re.test(workspaceName)) return WORKSPACE_ROUTES[key];
  }
  return null;
}
