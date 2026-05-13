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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
