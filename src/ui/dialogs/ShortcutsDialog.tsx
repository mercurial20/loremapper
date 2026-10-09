import { useEditor } from '../../store/editorStore';
import { ALL_TOOLS } from '../toolDefs';
import { Modal } from './Modal';

const GENERAL: [string, string][] = [
  ['Ctrl/⌘ Z', 'Undo'],
  ['Ctrl/⌘ Shift Z · Ctrl Y', 'Redo'],
  ['Ctrl/⌘ S', 'Save now (saving is automatic)'],
  ['Ctrl/⌘ D', 'Duplicate selection'],
  ['Ctrl/⌘ A', 'Select all objects & labels'],
  ['Ctrl/⌘ ] / [', 'Bring forward / send backward (+Shift: front/back)'],
  ['Ctrl/⌘ 0', 'Fit whole planet'],
  ['Delete / Backspace', 'Delete selection (or last draft point)'],
  ['Arrows', 'Nudge selection (+Shift: ×10)'],
  ['Esc', 'Cancel drawing / clear selection'],
  ['Enter / double-click', 'Finish path, territory or measurement'],
  ['[ / ]', 'Brush radius (or object size)'],
  ['Shift [ / ]', 'Brush strength'],
  ['Alt + wheel', 'Brush radius'],
  ['Shift or Alt (painting)', 'Invert raise↔lower, paint↔erase, hide↔reveal'],
  ['1 – 7', 'Pick biome while painting'],
  ['Space + drag · middle/right drag', 'Pan'],
  ['Wheel · pinch', 'Zoom at cursor'],
  ['?', 'This help'],
];

export function ShortcutsDialog() {
  const set = useEditor((s) => s.set);
  return (
    <Modal title="Keyboard shortcuts" onClose={() => set({ dialog: null })} wide>
      <div className="shortcuts">
        <div>
          <h4>Tools</h4>
          <dl>
            {ALL_TOOLS.map((t) => (
              <div key={t.id}>
                <dt>
                  <kbd>{t.key}</kbd>
                </dt>
                <dd>{t.name}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h4>General</h4>
          <dl>
            {GENERAL.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Modal>
  );
}
