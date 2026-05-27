import { BankerProvider } from '../banker/BankerProvider';
import { BankerShell } from '../banker/BankerShell';
import { useBootstrap } from '../bootstrap/BootstrapContext';

/**
 * Phase 117: BankerWorkspace is the route entry point only. Identity
 * resolution lives in `BankerProvider`; UX shell + tabs + KPI grid
 * + right rail live in `BankerShell`. The split keeps the route file
 * to a single import + a single composition.
 *
 * Permission-before-render is preserved: `BankerProvider` blocks
 * rendering until a `cr664_Banker` row resolves against the
 * signed-in UPN. Read-only mode (no Dataverse systemuser provisioned)
 * is surfaced through the shell's header banner, not by silently
 * letting writes through.
 *
 * Phase 120: `workspaceName` from the bootstrap result is passed
 * through so the shell sidebar can render the workspace switcher
 * footer honestly (single workspace state — the entitlement model
 * currently surfaces one workspace per signed-in user).
 */
export function BankerWorkspace() {
  const bootstrap = useBootstrap();
  return (
    <BankerProvider>
      <BankerShell workspaceName={bootstrap.workspaceName} />
    </BankerProvider>
  );
}
