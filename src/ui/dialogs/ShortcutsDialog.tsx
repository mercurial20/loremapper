import { useEditor } from '../../store/editorStore';
import { ALL_TOOLS } from '../toolDefs';
import { APP_VERSION } from '../../version';
import { Modal } from './Modal';
import { useTranslation } from 'react-i18next';
import { N_ } from '../../i18n';

const GENERAL: [string, string][] = [
  ['Ctrl/⌘ Z', N_('Undo')],
  ['Ctrl/⌘ Shift Z · Ctrl Y', N_('Redo')],
  ['Ctrl/⌘ S', N_('Save now (saving is automatic)')],
  ['Ctrl/⌘ D', N_('Duplicate selection')],
  ['Ctrl/⌘ A', N_('Select all objects & labels')],
  ['Ctrl/⌘ ] / [', N_('Bring forward / send backward (+Shift: front/back)')],
  ['Ctrl/⌘ 0', N_('Fit whole map')],
  [N_('Delete / Backspace'), N_('Delete selection (or last draft point)')],
  [N_('Arrows'), N_('Nudge selection (+Shift: ×10)')],
  ['Esc', N_('Cancel drawing / clear selection')],
  [N_('Enter / double-click'), N_('Finish path, territory or measurement')],
  ['[ / ]', N_('Brush radius (or object size)')],
  ['Shift [ / ]', N_('Brush strength')],
  [N_('Alt + wheel'), N_('Brush radius')],
  [N_('Shift or Alt (painting)'), N_('Invert raise↔lower, paint↔erase, hide↔reveal')],
  ['1 – 8', N_('Pick biome while painting')],
  [N_('Space + drag · middle/right drag'), N_('Pan')],
  [N_('Wheel · pinch'), N_('Zoom at cursor')],
  ['\\', N_('Hide or show the right panel')],
  ['?', N_('This help')],
];

export function ShortcutsDialog() {
  const { t } = useTranslation();
  const set = useEditor((s) => s.set);
  return (
    <Modal title={t('Keyboard shortcuts')} onClose={() => set({ dialog: null })} wide footer={<small className="muted">Loremapper v{APP_VERSION} · {t('data is stored locally in this browser')}</small>}>
      <div className="shortcuts">
        <div>
          <h4>{t('Tools')}</h4>
          <dl>
            {ALL_TOOLS.map((def) => (
              <div key={def.id}>
                <dt>
                  <kbd>{def.key}</kbd>
                </dt>
                <dd>{t(def.name)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h4>{t('General')}</h4>
          <dl>
            {GENERAL.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{t(k)}</kbd>
                </dt>
                <dd>{t(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Modal>
  );
}
