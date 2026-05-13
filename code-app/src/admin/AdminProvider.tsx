import { useBootstrap } from '../bootstrap/BootstrapContext';
import { AdminIdentityProvider } from './AdminContext';

/**
 * Minimal admin identity resolver. Routing already confirmed (via
 * AuthGate + WorkspaceGate + bootstrap) that the current user's
 * LOSUserProfile maps them to the admin workspace, so AdminProvider
 * doesn't need a second identity lookup.
 *
 * Kept as its own dedicated provider (per phase-17 brief) so future
 * drift can't accidentally wire admin diagnostics into an operational
 * provider. src/admin/ is sealed: no imports from src/banker,
 * src/manager, src/team, src/executive, or src/deals.
 */
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { upn, fullName, profileName } = useBootstrap();
  return (
    <AdminIdentityProvider value={{ upn, fullName, profileName }}>
      {children}
    </AdminIdentityProvider>
  );
}
