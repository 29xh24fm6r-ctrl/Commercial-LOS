import { useBootstrap } from '../bootstrap/BootstrapContext';
import { ExecutiveIdentityProvider } from './ExecutiveContext';

/**
 * Resolves executive identity for the Executive Workspace. Unlike
 * BankerProvider / ManagerProvider, there's no separate executive
 * profile entity that needs a lookup — the bootstrap already verified
 * the user's LOSUserProfile routes them here. We just adapt the
 * bootstrap-context values into a dedicated executive identity shape
 * so this provider stays the explicit boundary the spec requires.
 *
 * Architectural rule (SPEC W2 / phase-15 brief):
 *   Executive Workspace must NOT consume live operational queries
 *   from BankerProvider or ManagerProvider. Even though this provider
 *   is structurally simpler, keeping it as its own thing prevents
 *   future drift where someone wires the executive UI directly into
 *   an operational provider.
 */
export function ExecutiveProvider({ children }: { children: React.ReactNode }) {
  const { upn, fullName, profileName } = useBootstrap();
  return (
    <ExecutiveIdentityProvider value={{ upn, fullName, profileName }}>
      {children}
    </ExecutiveIdentityProvider>
  );
}
