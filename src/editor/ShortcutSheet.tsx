import { Dialog } from '../ui/controls';
import { useEditor, setUi } from './store';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? 'Cmd' : 'Ctrl';

const ROWS: [keys: string[], what: string][] = [
  [['Space'], 'Play or pause'],
  [['J'], 'Back 3 seconds'],
  [['K'], 'Pause'],
  [['L'], 'Play; press again to speed up'],
  [['←', '→'], 'Previous or next word'],
  [['Shift', '←', '→'], 'Extend the word selection'],
  [['Delete'], 'Cut the selection, or restore it if it is cut'],
  [[MOD, 'Z'], 'Undo'],
  [['Shift', MOD, 'Z'], 'Redo'],
  [[MOD, 'F'], 'Search the transcript'],
  [[MOD, 'E'], 'Export'],
  [['Esc'], 'Clear the selection'],
  [['?'], 'Show this sheet'],
];

export function ShortcutSheet() {
  const open = useEditor((s) => s.ui.shortcutsOpen);
  return (
    <Dialog open={open} onClose={() => setUi({ shortcutsOpen: false })} title="Keyboard shortcuts">
      <dl className="shortcuts">
        {ROWS.map(([keys, what]) => (
          <div key={what} className="shortcut-row">
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <p className="dialog-foot-note">In the transcript: click a word to jump to it, drag or Shift-click to select, double-click to fix its spelling.</p>
    </Dialog>
  );
}
