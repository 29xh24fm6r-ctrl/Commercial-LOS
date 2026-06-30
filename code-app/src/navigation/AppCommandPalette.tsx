import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandPalette, type CommandGroup } from '../design/CommandPalette';
import { WORKSPACE_ROUTES, type WorkspaceKey } from '../bootstrap/workspaceRoutes';
import { FEATURE_SURFACES } from './featureSurfaces';

const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  banker: 'Banker workspace',
  team: 'Team workspace',
  manager: 'Manager command center',
  executive: 'Executive dashboard',
  admin: 'Admin control center',
};

/**
 * App-wide ⌘K command palette, wired to the real router. Navigation-first
 * (workspaces + the read-only feature surfaces); it only navigates — it never
 * performs a write, so it is safe to mount globally.
 */
export function AppCommandPalette() {
  const navigate = useNavigate();

  const groups = useMemo<CommandGroup[]>(() => {
    const workspaces: CommandGroup = {
      heading: 'Workspaces',
      items: (Object.keys(WORKSPACE_ROUTES) as WorkspaceKey[]).map((key) => ({
        id: `ws-${key}`,
        label: WORKSPACE_LABELS[key],
        meta: WORKSPACE_ROUTES[key],
        keywords: [key, 'workspace', 'go to'],
        run: () => navigate(WORKSPACE_ROUTES[key]),
      })),
    };
    const surfaces: CommandGroup = {
      heading: 'Surfaces',
      items: FEATURE_SURFACES.map((s) => ({
        id: `surface-${s.key}`,
        label: `Open ${s.label}`,
        meta: `/surfaces/${s.key}`,
        keywords: [s.key, 'surface', s.workspace],
        run: () => navigate(`/surfaces/${s.key}`),
      })),
    };
    return [workspaces, surfaces];
  }, [navigate]);

  return <CommandPalette groups={groups} />;
}
