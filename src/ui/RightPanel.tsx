import { X } from 'lucide-react';
import { useDoc } from '../store/docStore';
import { togglePanel, useEditor } from '../store/editorStore';
import { Section } from './controls/controls';
import { clearInspect, kindLabel, useInspectedRegion } from '../editor/geography';
import { LandsList, RegionInspector } from './panels/GeographyPanel';
import { LayersPanel, ViewerLayers } from './panels/LayersPanel';
import { ViewerInfo } from './panels/ViewerInfo';
import { SelectionInspector } from './panels/SelectionInspector';
import { LakeControls } from './panels/LakeInspector';
import { selectionTitle } from './panels/selectionTitle';
import { ToolOptions } from './panels/ToolOptions';
import { ALL_TOOLS } from './toolDefs';
import { useTranslation } from 'react-i18next';

export function RightPanel() {
  const { t } = useTranslation();
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
  const lake = useEditor((s) => s.selectedLake);
  const closeRegion = (
    <button className="icon-btn small" onClick={clearInspect} title={t('Close (Esc)')} aria-label={t('Close')}>
      <X size={14} />
    </button>
  );
  // in the viewer the panel only answers a tap, so closing the answer tucks the panel away
  const closeViewer = (
    <button
      className="icon-btn small"
      onClick={() => {
        set({ selection: [] });
        clearInspect();
        togglePanel(false);
      }}
      title={t('Close')}
      aria-label={t('Close')}
    >
      <X size={14} />
    </button>
  );
  if (readOnly)
    return (
      <aside className="right-panel viewer-panel">
        <div className="right-scroll">
          {sel.length > 0 && (
            <Section title={selectionTitle(sel[0]?.kind, sel.length)} className="selection-section" actions={closeViewer}>
              <ViewerInfo />
            </Section>
          )}
          {region && sel.length === 0 && (
            <Section title={kindLabel(region.kind)} className="selection-section" actions={closeViewer}>
              <RegionInspector r={region} />
            </Section>
          )}
          <Section title={t('Lands & seas')} open={geoListOpen} onToggle={(v) => set({ geoListOpen: v })}>
            <LandsList />
          </Section>
          <Section title={t('Layers')} open={layersOpen} onToggle={(v) => set({ layersOpen: v })}>
            <ViewerLayers />
          </Section>
        </div>
      </aside>
    );
  return (
    <aside className="right-panel">
      <div className="right-scroll">
        {sel.length > 0 && (
          <Section title={selectionTitle(sel[0]?.kind, sel.length)} className="selection-section" actions={closeRegion}>
            <SelectionInspector />
          </Section>
        )}
        {lake && sel.length === 0 && (
          <Section title={kindLabel('lake')} className="selection-section" actions={closeRegion}>
            <LakeControls measured={!!region} />
            {region && <RegionInspector r={region} />}
          </Section>
        )}
        {region && !lake && sel.length === 0 && (
          <Section title={kindLabel(region.kind)} className="selection-section" actions={closeRegion}>
            <RegionInspector r={region} />
          </Section>
        )}
        <Section title={def ? t(def.name) : t('Tool')} open={inspectorOpen} onToggle={(v) => set({ inspectorOpen: v })}>
          <ToolOptions />
        </Section>
        <Section title={t('Lands & seas')} open={geoListOpen} onToggle={(v) => set({ geoListOpen: v })}>
          <LandsList />
        </Section>
        <Section title={t('Layers · {n} objects', { n: objectCount })} open={layersOpen} onToggle={(v) => set({ layersOpen: v })}>
          <LayersPanel />
        </Section>
      </div>
    </aside>
  );
}
