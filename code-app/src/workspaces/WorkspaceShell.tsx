interface WorkspaceShellProps {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}

export function WorkspaceShell({ title, subtitle, children }: WorkspaceShellProps) {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
        <p style={styles.subtitle}>{subtitle}</p>
      </header>
      <main style={styles.main}>
        {children ?? <p style={styles.placeholder}>Coming in phase 3.</p>}
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
  },
  title: { margin: 0, fontSize: '1.5rem' },
  subtitle: { margin: '0.25rem 0 0', color: '#666', fontSize: '0.95rem' },
  main: { padding: '2rem' },
  placeholder: { color: '#888' },
};
