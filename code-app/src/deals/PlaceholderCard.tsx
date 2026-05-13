interface PlaceholderCardProps {
  title: string;
  hint: string;
}

export function PlaceholderCard({ title, hint }: PlaceholderCardProps) {
  return (
    <section style={styles.card} aria-label={title}>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.hint}>{hint}</p>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: '1rem 1.1rem',
    minHeight: 110,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  title: { margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#222' },
  hint: { margin: 0, color: '#888', fontSize: '0.85rem', fontStyle: 'italic' },
};
