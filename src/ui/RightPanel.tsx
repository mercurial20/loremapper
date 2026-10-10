import { X } from 'lucide-react';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { Section } from './controls/controls';
import { clearInspect, kindLabel, useInspectedRegion } from '../editor/geography';
import { LandsList, RegionInspector } from './panels/GeographyPanel';
import { LayersPanel, ViewerLayers } from './panels/LayersPanel';
import { ViewerInfo } from './panels/ViewerInfo';
import { SelectionInspector } from './panels/SelectionInspector';
import { selectionTitle } from './panels/selectionTitle';
import { ToolOptions } from './panels/ToolOptions';
import { ALL_TOOLS } from './toolDefs';

export function RightPanel() {
  const tool = useEditor((s) => s.tool);
  const sel = useEditor((s) => s.selection);
  const inspectorOpen = useEditor((s) => s.inspectorOpen);
  const layersOpen = useEditor((s) => s.layersOpen);
  const geoListOpen = useEditor((s) => s.geoListOpen);
  const region = useInspectedRegion();
  const readOnly = useEditor((s) => s.readOnly);
  const set = useEditor((s) => s.set);
  const objectCount = useDoc((s) => Object.keys(s.doc.objects).length);
  const def = ALL_TOOLS.find((t) => t.id === tool);
  const closeRegion = (
    <button className="icon-btn small" onClick={clearInspect} title="Close (Esc)" aria-label="Close">
      <X size={14} />
    </button>
  );
  if (readOnly)
    return (
      <aside className="right-panel viewer-panel">
        <div className="right-scroll">
          {sel.length > 0 && (
            <Section title={selectionTitle(sel[0]?.kind, sel.length)} className="selection-section">
              <ViewerInfo />
            </Section>
          )}
          {region && sel.length === 0 && (
            <Section title={kindLabel(region.kind)} className="selection-section" actions={closeRegion}>
              <RegionInspector r={region} />
            </Section>
          )}
          <Section title="Lands & seas" open={geoListOpen} onToggle={(v) => set({ geoListOpen: v })}>
            <LandsList />
          </Section>
          <Section title="Layers" open={layersOpen} onToggle={(v) => set({ layersOpen: v })}>
            <ViewerLayers />
          </Section>
        </div>
      </aside>
    );
  return (
    <aside className="right-panel">
      <div className="right-scroll">
        {sel.length > 0 && (
          <Section title={selectionTitle(sel[0]?.kind, sel.length)} className="selection-section">
            <SelectionInspector />
          </Section>
        )}
        {region && sel.length === 0 && (
          <Section title={kindLabel(region.kind)} className="selection-section" actions={closeRegion}>
            <RegionInspector r={region} />
          </Section>
        )}
        <Section title={def ? def.name : 'Tool'} open={inspectorOpen} onToggle={(v) => set({ inspectorOpen: v })}>
          <ToolOptions />
        </Section>
        <Section title="Lands & seas" open={geoListOpen} onToggle={(v) => set({ geoListOpen: v })}>
          <LandsList />
        </Section>
        <Section title={`Layers · ${objectCount} objects`} open={layersOpen} onToggle={(v) => set({ layersOpen: v })}>
          <LayersPanel />
        </Section>
      </div>
    </aside>
  );
}
