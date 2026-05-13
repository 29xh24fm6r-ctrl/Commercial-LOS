interface ErrorStateProps {
  title: string;
  detail?: string;
  hint?: string;
}

export function ErrorState({ title, detail, hint }: ErrorStateProps) {
  return (
    <div role="alert" style={styles.container}>
      <h1 style={styles.title}>{title}</h1>
      {detail && <p style={styles.detail}>{detail}</p>}
      {hint && <p style={styles.hint}>{hint}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    minHeight: '100vh',
    padding: '2rem',
    fontFamily: 'system-ui, sans-serif',
    textAlign: 'center',
  },
  title: { color: '#b00020', margin: 0, fontSize: '1.5rem' },
  detail: { color: '#222', margin: 0, maxWidth: 480 },
  hint: { color: '#666', margin: 0, maxWidth: 480, fontSize: '0.9rem' },
};
