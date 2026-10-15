import { useEditor } from '../store/editorStore';
import { TOOL_GROUPS } from './toolDefs';
import { useTranslation } from 'react-i18next';

export function Toolbar() {
  const { t } = useTranslation();
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <nav className="toolbar" aria-label={t('Tools')}>
      {TOOL_GROUPS.map((g, i) => (
        <div className="tool-group" key={i}>
          {g.map((def) => {
            const Icon = def.icon;
            return (
              <button key={def.id} className={'tool-btn' + (tool === def.id ? ' active' : '')} onClick={() => setTool(def.id)} aria-label={t(def.name)} data-tool={def.id}>
                <Icon width={20} height={20} size={20} />
                <span className="tool-tip">
                  <b>{t(def.name)}</b>
                  <kbd>{def.key}</kbd>
                  <small>{t(def.help)}</small>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
