import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useBootstrap } from '../../bootstrap/BootstrapContext';
import { deriveWorkspaceLinks, useEntitledRoutes } from '../../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import { CRM_SECTIONS } from './crmWorkspaceModel';
import { CrmExperience } from './CrmExperience';
import { useEffect, useState } from 'react';
import { resolveCurrentSystemUserId } from '../../shared/governance/currentUserLookup';
import { LendingOSLayout } from '../../banker/LendingOSLayout';
import { crmSectionPath, crmSidebarDestination } from './crmShellNavigation';
import './crmWorkspace.css';

export function CrmWorkspace() {
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  const navigate = useNavigate();
  const links = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.crm,
    entitledRoutes: entitled.routes,
  });
  const [systemUserId, setSystemUserId] = useState<string | undefined>();
  const copilotRole = bootstrap.route === WORKSPACE_ROUTES.executive ? 'executive'
    : bootstrap.route === WORKSPACE_ROUTES.manager ? 'manager'
    : bootstrap.route === WORKSPACE_ROUTES.team ? 'team' : 'banker';
  useEffect(() => {
    let cancelled = false;
    resolveCurrentSystemUserId(bootstrap.entraObjectId).then((id) => {
      if (!cancelled) setSystemUserId(id ?? undefined);
    }).catch(() => { if (!cancelled) setSystemUserId(undefined); });
    return () => { cancelled = true; };
  }, [bootstrap.entraObjectId]);

  return (
    <LendingOSLayout
      activeNav="crm-hub"
      onNavSelect={(navKey) => {
        const destination = crmSidebarDestination(navKey, bootstrap.route);
        navigate(destination.route, destination.state ? { state: destination.state } : undefined);
      }}
      fullName={bootstrap.fullName}
      email={bootstrap.upn}
      workspaceName="CRM Workspace"
      workspaceLinks={links}
    >
      <div className="crmws" data-crm-workspace>
        <header className="crmws__masthead">
          <div>
            <div className="crmws__eyebrow">Old Glory Bank · Commercial Banking</div>
            <h1>CRM Workspace</h1>
            <p>Companies, people, opportunities, activity, and lending relationships in one governed workspace.</p>
          </div>
        </header>
        <nav className="crmws__nav" aria-label="CRM sections">
          {CRM_SECTIONS.map((section) => (
            <NavLink key={section} to={crmSectionPath(section)} className={({ isActive }) => isActive ? 'is-active' : undefined}>
              {section[0].toUpperCase() + section.slice(1)}
            </NavLink>
          ))}
        </nav>
        <main className="crmws__main">
          <Routes>
            <Route index element={<Navigate to="home" replace />} />
            {CRM_SECTIONS.map((section) => (
              <Route key={section} path={`${section}/:recordId?`} element={
                <CrmExperience section={section} actorEmail={bootstrap.upn} actorSystemUserId={systemUserId}
                  copilotRole={copilotRole}
                  userName={bootstrap.fullName}
                  writeDisabledReason={systemUserId ? undefined : 'No Dataverse systemuser is resolved for this signed-in identity.'} />
              } />
            ))}
            <Route path="*" element={<CrmSectionBlocked />} />
          </Routes>
        </main>
      </div>
    </LendingOSLayout>
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
