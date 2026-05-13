import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Bootstrap } from './bootstrap/Bootstrap';
import { BankerWorkspace } from './workspaces/BankerWorkspace';
import { TeamWorkspace } from './workspaces/TeamWorkspace';
import { ManagerWorkspace } from './workspaces/ManagerWorkspace';
import { ExecutiveWorkspace } from './workspaces/ExecutiveWorkspace';
import { AdminWorkspace } from './workspaces/AdminWorkspace';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Bootstrap />} />
        <Route path="/workspaces/banker" element={<BankerWorkspace />} />
        <Route path="/workspaces/team" element={<TeamWorkspace />} />
        <Route path="/workspaces/manager" element={<ManagerWorkspace />} />
        <Route path="/workspaces/executive" element={<ExecutiveWorkspace />} />
        <Route path="/workspaces/admin" element={<AdminWorkspace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
