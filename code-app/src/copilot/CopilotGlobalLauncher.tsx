import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import { isCopilotSurfaceLive } from './copilotConnector';
import { COPILOT_ATTENTION_EVENT, OPEN_COPILOT_EVENT } from './copilotLauncherEvents';

const CONTEXTUAL_SURFACE_SELECTOR = [
  '[data-deal-card="copilot-assist"]',
  '[data-copilot-surface]',
  '[data-cockpit-copilot]',
  '.crmws__copilot',
].join(',');

const DESTINATIONS = [
  { label: 'Banker assistant', path: '/workspaces/banker', detail: 'Pipeline, priorities, and active deals' },
  { label: 'CRM intelligence', path: '/workspaces/crm', detail: 'Companies, people, and relationships' },
  { label: 'Team assistant', path: '/workspaces/team', detail: 'Team queues and execution blockers' },
  { label: 'Manager assistant', path: '/workspaces/manager', detail: 'Portfolio and operating oversight' },
] as const;

/**
 * Authenticated, app-wide Copilot entry point. It never loads business data or
 * invokes a tool itself: it reveals the already-authorized contextual surface.
 */
export function CopilotGlobalLauncher() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [attention, setAttention] = useState(0);
  const live = isCopilotSurfaceLive();

  useEffect(() => {
    const openLauncher = () => setOpen(true);
    const keyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setOpen(true);
      }
    };
    const attentionChanged = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count ?? 0);
      setAttention(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    };
    window.addEventListener(OPEN_COPILOT_EVENT, openLauncher);
    window.addEventListener(COPILOT_ATTENTION_EVENT, attentionChanged);
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener(OPEN_COPILOT_EVENT, openLauncher);
      window.removeEventListener(COPILOT_ATTENTION_EVENT, attentionChanged);
      window.removeEventListener('keydown', keyboard);
    };
  }, []);

  function revealContextualAssistant() {
    const surface = document.querySelector<HTMLElement>(CONTEXTUAL_SURFACE_SELECTOR);
    if (!surface) return false;
    surface.scrollIntoView({ behavior: 'smooth', block: 'start' });
    surface.querySelector<HTMLButtonElement>('[aria-label="Expand Copilot panel"]')?.click();
    surface.focus({ preventScroll: true });
    setOpen(false);
    return true;
  }

  return <>
    <button
      type="button"
      style={launcherStyle}
      onClick={() => setOpen(true)}
      aria-label="Open Microsoft Copilot"
      aria-haspopup="dialog"
      aria-expanded={open}
      data-copilot-global-launcher
    >
      <span aria-hidden="true" style={sparkStyle}>✦</span>
      <span>Copilot</span>
      {attention > 0 && <span style={launcherBadgeStyle} aria-label={`${attention} Copilot items need review`}>{attention}</span>}
      <span style={{ ...statusDotStyle, background: live ? palette.clear : palette.textSubtle }} aria-hidden="true" />
    </button>

    {open && <div style={backdropStyle} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <aside style={drawerStyle} role="dialog" aria-modal="true" aria-labelledby="copilot-launcher-title">
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Old Glory Bank</div>
            <h2 id="copilot-launcher-title" style={titleStyle}>Microsoft Copilot</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close Microsoft Copilot" style={closeStyle}>×</button>
        </header>

        <div style={statusStyle} role="status">
          <span style={{ ...statusDotStyle, background: live ? palette.clear : palette.textSubtle }} aria-hidden="true" />
          {live ? 'Connected · governed read-only assistance' : 'Unavailable · connector or permission not active'}
        </div>

        <p style={copyStyle}>Copilot can research, summarize, explain, and propose. It cannot approve credit, change governed data, or send communications.</p>

        <button type="button" style={primaryStyle} disabled={!live} onClick={() => {
          if (!revealContextualAssistant()) navigate('/workspaces/banker');
        }}>
          Open assistant for this page
        </button>

        <section aria-label="Copilot destinations" style={destinationStyle}>
          <h3 style={sectionTitleStyle}>Go to a Copilot workspace</h3>
          {DESTINATIONS.map((destination) => <button
            type="button"
            key={destination.path}
            style={destinationButtonStyle}
            aria-current={location.pathname.startsWith(destination.path) ? 'page' : undefined}
            onClick={() => { navigate(destination.path); setOpen(false); }}
          >
            <strong>{destination.label}</strong>
            <span>{destination.detail}</span>
          </button>)}
        </section>

        <footer style={footerStyle}>Keyboard shortcut: Ctrl + Shift + C</footer>
      </aside>
    </div>}
  </>;
}

const launcherStyle: CSSProperties = { position: 'fixed', right: spacing.lg, bottom: spacing.lg, zIndex: 900, display: 'flex', alignItems: 'center', gap: spacing.xs, padding: `${spacing.sm} ${spacing.lg}`, borderRadius: radius.pill, border: `1px solid ${palette.cobalt}`, background: palette.cobalt, color: '#fff', boxShadow: shadow.elevated, cursor: 'pointer', font: `600 ${typography.size.sm} ${typography.family}` };
const sparkStyle: CSSProperties = { fontSize: typography.size.lg };
const statusDotStyle: CSSProperties = { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' };
const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 950, display: 'flex', justifyContent: 'flex-end', background: 'rgba(15, 23, 42, .35)' };
const drawerStyle: CSSProperties = { width: 'min(430px, 100vw)', height: '100%', overflowY: 'auto', background: palette.surface, color: palette.text, boxShadow: shadow.elevated, padding: spacing.xl, display: 'flex', flexDirection: 'column', gap: spacing.lg, fontFamily: typography.family };
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: spacing.md };
const eyebrowStyle: CSSProperties = { color: palette.cobalt, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontSize: typography.size.xs, fontWeight: typography.weight.semibold };
const titleStyle: CSSProperties = { margin: `${spacing.xs} 0 0`, fontSize: typography.size.xl };
const closeStyle: CSSProperties = { border: 0, background: 'transparent', color: palette.textMuted, cursor: 'pointer', fontSize: 28, lineHeight: 1 };
const statusStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, border: `1px solid ${palette.border}`, borderRadius: radius.sm, background: palette.surfaceAlt, fontSize: typography.size.sm };
const copyStyle: CSSProperties = { margin: 0, color: palette.textMuted, lineHeight: typography.lineHeight.normal };
const primaryStyle: CSSProperties = { padding: spacing.md, border: 0, borderRadius: radius.sm, background: palette.cobalt, color: '#fff', fontWeight: typography.weight.semibold, cursor: 'pointer' };
const launcherBadgeStyle: CSSProperties = { minWidth: 18, height: 18, padding: '0 4px', borderRadius: radius.pill, background: palette.atRisk, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: typography.size.xs };
const destinationStyle: CSSProperties = { display: 'grid', gap: spacing.sm };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: typography.size.md };
const destinationButtonStyle: CSSProperties = { display: 'grid', gap: 2, textAlign: 'left', padding: spacing.md, border: `1px solid ${palette.border}`, borderRadius: radius.sm, background: palette.surface, color: palette.text, cursor: 'pointer', fontFamily: 'inherit' };
const footerStyle: CSSProperties = { marginTop: 'auto', color: palette.textSubtle, fontSize: typography.size.xs };
