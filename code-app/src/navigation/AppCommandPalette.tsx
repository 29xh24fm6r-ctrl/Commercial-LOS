import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandPalette, type CommandGroup } from '../design/CommandPalette';
import { WORKSPACE_ROUTES, WORKSPACE_DISPLAY_NAMES, type WorkspaceKey } from '../bootstrap/workspaceRoutes';
import { FEATURE_SURFACES } from './featureSurfaces';
import { isFeatureSurfaceFlagEnabled } from './featureSurfaceFlags';

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
        label: WORKSPACE_DISPLAY_NAMES[key],
        meta: WORKSPACE_ROUTES[key],
        keywords: [key, 'workspace', 'go to'],
        run: () => navigate(WORKSPACE_ROUTES[key]),
      })),
    };
    // Only advertise surfaces whose route flag is on — otherwise ⌘K sends the user to a
    // "not enabled" screen (e.g. crm-intelligence, flag off). A disabled surface is not a
    // reachable destination.
    const surfaceItems = FEATURE_SURFACES.filter((s) => isFeatureSurfaceFlagEnabled(s.flag)).map((s) => ({
      id: `surface-${s.key}`,
      label: `Open ${s.label}`,
      meta: `/surfaces/${s.key}`,
      keywords: [s.key, 'surface', s.workspace],
      run: () => navigate(`/surfaces/${s.key}`),
    }));
    const result: CommandGroup[] = [workspaces];
    if (surfaceItems.length > 0) result.push({ heading: 'Surfaces', items: surfaceItems });
    return result;
  }, [navigate]);

  return <CommandPalette groups={groups} />;
}
