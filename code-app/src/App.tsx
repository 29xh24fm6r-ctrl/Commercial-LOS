import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthGate } from './bootstrap/AuthGate';
import { HomeRedirect } from './bootstrap/HomeRedirect';
import { WorkspaceGate } from './bootstrap/WorkspaceGate';
import { WORKSPACE_ROUTES } from './bootstrap/workspaceRoutes';
import { BankerWorkspace } from './workspaces/BankerWorkspace';
import { TeamWorkspace } from './workspaces/TeamWorkspace';
import { ManagerWorkspace } from './workspaces/ManagerWorkspace';
import { ExecutiveWorkspace } from './workspaces/ExecutiveWorkspace';
import { AdminWorkspace } from './workspaces/AdminWorkspace';
import { DealRoute } from './deals/DealRoute';
import { FeatureSurfaceRoute } from './navigation/FeatureSurfaceRoute';
import { DesignGallery } from './design/Gallery';
import { AppCommandPalette } from './navigation/AppCommandPalette';
import { CrmWorkspace } from './crm/firstClass/CrmWorkspace';
import { getDeploymentCommit } from './shared/deploymentCommit';

export default function App() {
  const deploymentCommit = getDeploymentCommit();

  return (
    <BrowserRouter>
      <div
        aria-label={`Deployed build ${deploymentCommit ?? 'unknown'}`}
        data-testid="runtime-build-marker"
        style={{
          position: 'fixed',
          right: 12,
          top: 8,
          zIndex: 10000,
          border: '1px solid rgba(255,255,255,0.22)',
          borderRadius: 999,
          background: 'rgba(9,24,52,0.9)',
          color: '#dce8ff',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10,
          letterSpacing: '0.04em',
          padding: '3px 8px',
          pointerEvents: 'none',
        }}
      >
        build {deploymentCommit ?? 'unknown'}
      </div>
      {/* App-wide ⌘K command palette (navigation-only; never writes). */}
      <AppCommandPalette />
      <Routes>
        {/* Dev-only Intaglio primitive gallery — outside AuthGate so it renders
            standalone (no tenant bootstrap). Stripped from production builds. */}
        {import.meta.env.DEV && <Route path="/design" element={<DesignGallery />} />}
        <Route element={<AuthGate />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path={WORKSPACE_ROUTES.banker}
            element={
              <WorkspaceGate allowed={WORKSPACE_ROUTES.banker}>
                <BankerWorkspace />
              </WorkspaceGate>
            }
          />
          <Route
            path={`${WORKSPACE_ROUTES.crm}/*`}
            element={
              <WorkspaceGate allowed={WORKSPACE_ROUTES.crm}>
                <CrmWorkspace />
              </WorkspaceGate>
            }
          />
          <Route
            path={WORKSPACE_ROUTES.team}
            element={
              <WorkspaceGate allowed={WORKSPACE_ROUTES.team}>
                <TeamWorkspace />
              </WorkspaceGate>
            }
          />
          <Route
            path={WORKSPACE_ROUTES.manager}
            element={
              <WorkspaceGate allowed={WORKSPACE_ROUTES.manager}>
                <ManagerWorkspace />
              </WorkspaceGate>
            }
          />
          <Route
            path={WORKSPACE_ROUTES.executive}
            element={
              <WorkspaceGate allowed={WORKSPACE_ROUTES.executive}>
                <ExecutiveWorkspace />
              </WorkspaceGate>
            }
          />
          <Route
            path={WORKSPACE_ROUTES.admin}
            element={
              <WorkspaceGate allowed={WORKSPACE_ROUTES.admin}>
                <AdminWorkspace />
              </WorkspaceGate>
            }
          />
          <Route path="/deals/:dealId" element={<DealRoute />} />
          {/* Phase 3: previously-unrouted subsystem surfaces, each gated by its
              owning workspace gate (inside the route component) AND a default-off
              route flag. Read-only; no writes. */}
          <Route path="/surfaces/:surfaceKey" element={<FeatureSurfaceRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
