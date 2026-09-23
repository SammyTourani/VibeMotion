import { useEditor } from './store';
import { acceptRestore, declineRestore } from './actions';
import { relativeDate } from '../lib/format';

export function RestoreBanner() {
  const restore = useEditor((s) => s.restore);
  if (!restore) return null;
  const words = restore.project.transcript?.words.length ?? 0;
  return (
    <div className="banner" role="region" aria-label="Restore edits">
      <p>
        <b>You edited this video before</b> ({relativeDate(restore.updatedAt)}
        {words ? `, ${words} words transcribed` : ''}). Pick up where you left off?
      </p>
      <div className="banner-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void acceptRestore()}>
          Restore your edits
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={declineRestore}>
          Start over
        </button>
      </div>
    </div>
  );
}
