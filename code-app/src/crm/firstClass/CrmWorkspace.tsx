import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useBootstrap } from '../../bootstrap/BootstrapContext';
import { deriveWorkspaceLinks, useEntitledRoutes } from '../../bootstrap/workspaceEntitlements';
import { WorkspaceSwitcher } from '../../bootstrap/WorkspaceSwitcher';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import { CrmHubWorkspace } from '../workspace/CrmHubWorkspace';
import { CRM_SECTIONS } from './crmWorkspaceModel';
import './crmWorkspace.css';

export function CrmWorkspace() {
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  const links = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.crm,
    entitledRoutes: entitled.routes,
  });

  return (
    <div className="crmws" data-crm-workspace>
      <header className="crmws__masthead">
        <div>
          <div className="crmws__eyebrow">Old Glory Bank · Commercial Banking</div>
          <h1>CRM Workspace</h1>
          <p>Companies, people, opportunities, activity, and lending relationships in one governed workspace.</p>
        </div>
        <WorkspaceSwitcher links={links} tone="dark" aria-label="CRM workspace switcher" />
      </header>
      <nav className="crmws__nav" aria-label="CRM sections">
        {CRM_SECTIONS.map((section) => (
          <NavLink key={section} to={section} className={({ isActive }) => isActive ? 'is-active' : undefined}>
            {section[0].toUpperCase() + section.slice(1)}
          </NavLink>
        ))}
      </nav>
      <main className="crmws__main">
        <Routes>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<CrmHubWorkspace actorEmail={bootstrap.upn} writeDisabledReason="A governed CRM writer identity is required." />} />
          <Route path="companies/*" element={<CrmHubWorkspace actorEmail={bootstrap.upn} writeDisabledReason="A governed CRM writer identity is required." />} />
          <Route path="*" element={<CrmSectionBlocked />} />
        </Routes>
      </main>
    </div>
  );
}

function CrmSectionBlocked() {
  return (
    <section className="crmws__blocked" role="status">
      <span>DATA DEPENDENCY</span>
      <h2>This CRM section is not available from the current governed schema.</h2>
      <p>No records or metrics are synthesized. The workspace will enable this section only when its source and authorization boundary are verified.</p>
    </section>
  );
}
