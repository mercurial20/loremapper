import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { Section } from './controls/controls';
import { LayersPanel } from './panels/LayersPanel';
import { SelectionInspector } from './panels/SelectionInspector';
import { selectionTitle } from './panels/selectionTitle';
import { ToolOptions } from './panels/ToolOptions';
import { ALL_TOOLS } from './toolDefs';

export function RightPanel() {
  const tool = useEditor((s) => s.tool);
  const sel = useEditor((s) => s.selection);
  const inspectorOpen = useEditor((s) => s.inspectorOpen);
  const layersOpen = useEditor((s) => s.layersOpen);
  const set = useEditor((s) => s.set);
  const objectCount = useDoc((s) => Object.keys(s.doc.objects).length);
  const def = ALL_TOOLS.find((t) => t.id === tool);
  return (
    <aside className="right-panel">
      <div className="right-scroll">
        {sel.length > 0 && (
          <Section title={selectionTitle(sel[0]?.kind, sel.length)} className="selection-section">
            <SelectionInspector />
          </Section>
        )}
        <Section title={def ? def.name : 'Tool'} open={inspectorOpen} onToggle={(v) => set({ inspectorOpen: v })}>
          <ToolOptions />
        </Section>
        <Section title={`Layers · ${objectCount} objects`} open={layersOpen} onToggle={(v) => set({ layersOpen: v })}>
          <LayersPanel />
        </Section>
      </div>
    </aside>
  );
}
