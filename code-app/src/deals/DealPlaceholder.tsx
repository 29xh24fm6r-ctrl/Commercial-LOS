import { Link, useParams } from 'react-router-dom';
import { useBootstrap } from '../bootstrap/BootstrapContext';

export function DealPlaceholder() {
  const { dealId } = useParams<{ dealId: string }>();
  const { route } = useBootstrap();

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Deal Workspace</h1>
        <p style={styles.subtitle}>
          Deal <code>{dealId}</code> — full workspace coming in a later phase.
        </p>
      </header>
      <main style={styles.main}>
        <Link to={route} style={styles.back}>
          ← Back to your workspace
        </Link>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#fafafa' },
  header: {
    padding: '1.5rem 2rem',
    borderBottom: '1px solid #e5e5e5',
    background: '#fff',
  },
  title: { margin: 0, fontSize: '1.5rem' },
  subtitle: { margin: '0.25rem 0 0', color: '#666', fontSize: '0.95rem' },
  main: { padding: '2rem' },
  back: { color: '#4a5fc1', textDecoration: 'none' },
};
