import { BankerProvider } from '../banker/BankerProvider';
import { useBanker } from '../banker/BankerContext';
import { PersonalPipeline } from '../banker/PersonalPipeline';

export function BankerWorkspace() {
  return (
    <BankerProvider>
      <BankerWorkspaceContent />
    </BankerProvider>
  );
}

function BankerWorkspaceContent() {
  const { fullName, email } = useBanker();
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Banker Workspace</h1>
          <p style={styles.subtitle}>Personal pipeline, active deals, command center.</p>
        </div>
        <div style={styles.who} aria-label="Signed in banker">
          <div style={styles.whoName}>{fullName}</div>
          <div style={styles.whoEmail}>{email}</div>
        </div>
      </header>
      <main style={styles.main}>
        <PersonalPipeline />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    minHeight: '100vh',
    color: '#1a1a1a',
    background: '#fafafa',
  },
  header: {
    padding: '1.5rem 2rem',
    borderBottom: '1px solid #e5e5e5',
    background: '#fff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: '1.5rem' },
  subtitle: { margin: '0.25rem 0 0', color: '#666', fontSize: '0.95rem' },
  who: { textAlign: 'right' },
  whoName: { fontWeight: 600 },
  whoEmail: { color: '#666', fontSize: '0.85rem' },
  main: { padding: '2rem' },
};
