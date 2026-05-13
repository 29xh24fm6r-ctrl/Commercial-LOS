import { Navigate } from 'react-router-dom';
import { useBootstrap } from './BootstrapContext';

interface WorkspaceGateProps {
  /** Path of the workspace this gate protects, e.g. "/workspaces/banker". */
  allowed: string;
  children: React.ReactNode;
}

/**
 * Hard execution boundary per spec W3: a user can only render the workspace
 * resolved for them at bootstrap. Direct-URL navigation to a different
 * workspace bounces back to the resolved one rather than silently leaking.
 */
export function WorkspaceGate({ allowed, children }: WorkspaceGateProps) {
  const { route } = useBootstrap();
  if (route !== allowed) {
    return <Navigate to={route} replace />;
  }
  return <>{children}</>;
}
