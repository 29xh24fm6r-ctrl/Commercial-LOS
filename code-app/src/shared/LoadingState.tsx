interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" style={styles.container}>
      <div style={styles.spinner} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    minHeight: '100vh',
    color: '#555',
    fontFamily: 'system-ui, sans-serif',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #e5e5e5',
    borderTopColor: '#4a5fc1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
