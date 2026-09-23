import { navigate } from '../app/router';
import { setPending } from '../app/handoff';

export function Landing() {
  return (
    <main style={{ padding: 48 }}>
      <h1>VibeMotion</h1>
      <button type="button" className="btn btn-primary" onClick={() => navigate('edit')}>
        Open the editor
      </button>{' '}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          setPending({ kind: 'sample' });
          navigate('edit');
        }}
      >
        Try the sample clip
      </button>
    </main>
  );
}
