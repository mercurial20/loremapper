import { useEditor } from '../store/editorStore';
import { TOOL_GROUPS } from './toolDefs';

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  return (
    <nav className="toolbar" aria-label="Tools">
      {TOOL_GROUPS.map((g, i) => (
        <div className="tool-group" key={i}>
          {g.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={'tool-btn' + (tool === t.id ? ' active' : '')} onClick={() => setTool(t.id)} aria-label={t.name} data-tool={t.id}>
                <Icon width={20} height={20} size={20} />
                <span className="tool-tip">
                  <b>{t.name}</b>
                  <kbd>{t.key}</kbd>
                  <small>{t.help}</small>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
