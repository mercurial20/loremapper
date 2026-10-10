import { CloudFog, Eye, Sun } from 'lucide-react';
import { useAssets } from '../../assets/library';
import { formatHeight, formatLength } from '../../core/units';
import { brushRange } from '../format';
import { BIOMES } from '../../core/planet';
import { restoreSuppressedPeaks } from '../../editor/commands';
import { editor } from '../../editor/Editor';
import { TERRITORY_TYPES, TERRITORY_TYPE_LABELS, type BorderStyle, type LabelFont, type RoadStyle, type TerritoryType } from '../../model/types';
import { FONT_LABEL } from '../../render/fonts';
import { STYLE_PRESETS } from '../../render/styles';
import { useDoc } from '../../store/docStore';
import { brushGroupOf, useEditor, type BrushGroup } from '../../store/editorStore';
import { raiseRate } from '../../terrain/brushes';
import { pushTileChange } from '../../tools/ToolController';
import { ALL_TOOLS } from '../toolDefs';
import { ColorField, Hint, MeasureField, Segmented, Select, Slider, Toggle } from '../controls/controls';

const SWATCHES = ['#b5452f', '#2f5d9a', '#3f8f5a', '#c79a2e', '#7a4aa0', '#2a8a8a', '#8f3a5c', '#5a5a5a'];
const PATH_SWATCHES = ['#4f86ad', '#2e5f86', '#6aa5c8', '#7a5532', '#4b3a2a', '#9a7b52', '#8a2e2e', '#2b2016'];

function BrushControls({ group, showOpacity = true }: { group: BrushGroup; showOpacity?: boolean }) {
  const b = useEditor((s) => s.brushes[group]);
  const setBrush = useEditor((s) => s.setBrush);
  const tool = useEditor((s) => s.tool);
  const units = useEditor((s) => s.units);
  useDoc((s) => s.meta);
  const range = editor.model ? brushRange(editor.model.geo) : { min: 5, max: 6000 };
  return (
    <>
      <Slider
        label="Radius"
        value={Math.min(range.max, Math.max(range.min, b.radiusKm))}
        min={range.min}
        max={range.max}
        log
        onChange={(v) => setBrush(group, { radiusKm: v })}
        format={(v) => formatLength(v, units)}
        hint="[ and ] keys, or Alt + mouse wheel"
      />
      <Slider
        label="Strength"
        value={b.strength}
        min={0.01}
        max={1}
        onChange={(v) => setBrush(group, { strength: v })}
        format={(v) => (tool === 'raise' || tool === 'lower' || tool === 'ridge' ? `${formatHeight(raiseRate(v), units)} / dab` : `${Math.round(v * 100)}%`)}
        hint="Shift + [ / ]"
      />
      <Slider label="Falloff (softness)" value={b.falloff} min={0} max={1} onChange={(v) => setBrush(group, { falloff: v })} format={(v) => `${Math.round(v * 100)}%`} />
      {(tool === 'raise' || tool === 'lower') && (
        <Slider
          label="Edge roughness"
          value={b.roughness ?? 0}
          min={0}
          max={1}
          onChange={(v) => setBrush(group, { roughness: v })}
          format={(v) => (v < 0.02 ? 'smooth' : `${Math.round(v * 100)}%`)}
          hint="Ragged, natural coastlines instead of round brush blobs"
        />
      )}
      {showOpacity && (
        <Slider
          label={tool === 'raise' || tool === 'lower' || tool === 'ridge' ? 'Stroke cap (opacity)' : 'Opacity'}
          value={b.opacity}
          min={0.02}
          max={1}
          onChange={(v) => setBrush(group, { opacity: v })}
          format={(v) => (tool === 'raise' || tool === 'lower' || tool === 'ridge' ? (v >= 0.99 ? 'none' : `±${formatHeight(v * 21000, units)}`) : `${Math.round(v * 100)}%`)}
          hint="The most a single stroke can change: build plateaus with a low cap."
        />
      )}
    </>
  );
}

function FogControls() {
  const fogMode = useEditor((s) => s.fogMode);
  const fogPreview = useEditor((s) => s.fogPreview);
  const set = useEditor((s) => s.set);
  const fillFog = (value: number) => {
    const m = editor.model;
    if (!m) return;
    const change = m.replaceLayer('fog', null, value);
    pushTileChange(change, value ? 'Cover map with fog' : 'Clear all fog', m);
  };
  return (
    <>
      <Segmented
        value={fogMode}
        onChange={(v) => set({ fogMode: v })}
        options={[
          { value: 'hide', label: <><CloudFog size={14} /> Hide</>, title: 'Paint fog over unexplored land' },
          { value: 'reveal', label: <><Sun size={14} /> Reveal</>, title: 'Clear fog from explored areas' },
        ]}
      />
      <BrushControls group="fog" />
      <Hint>Opacity sets fog density — paint at 50% for haze players can partly see through. Hold Shift/Alt to invert.</Hint>
      <div className="btn-row">
        <button className="btn" onClick={() => fillFog(255)}>Cover entire map</button>
        <button className="btn" onClick={() => fillFog(0)}>Clear all fog</button>
      </div>
      <Toggle label="See through fog (editor)" checked={fogPreview} onChange={(v) => set({ fogPreview: v })} hint="Show hidden content dimmed. Turn off to preview exactly what players see." />
      {!fogPreview && (
        <Hint>
          <Eye size={12} /> Player view: fogged areas are fully opaque.
        </Hint>
      )}
    </>
  );
}

function ObjectToolControls() {
  const { assetId, stamp, set, activeObjectLayer } = useEditor();
  const layers = useDoc((s) => s.doc.objectLayers);
  const assets = useAssets((s) => s.assets);
  const a = assets.find((x) => x.id === assetId);
  return (
    <>
      <div className="asset-current">
        {a ? (
          <>
            <img src={a.url} alt="" />
            <div>
              <b>{a.name}</b>
              <small>{a.category}</small>
            </div>
          </>
        ) : (
          <div className="empty">No asset chosen</div>
        )}
        <button className="btn" onClick={() => set({ assetPanelOpen: true })}>
          Library…
        </button>
      </div>
      <Segmented
        value={stamp.mode}
        onChange={(v) => set({ stamp: { ...stamp, mode: v } })}
        options={[
          { value: 'single', label: 'Single', title: 'Click to place one object' },
          { value: 'stamp', label: 'Stamp brush', title: 'Drag to place many' },
        ]}
      />
      <Select
        label="Place on layer"
        value={activeObjectLayer}
        options={layers.map((l) => ({ value: l.id, label: l.name + (l.locked ? ' (locked)' : '') }))}
        onChange={(v) => set({ activeObjectLayer: v })}
      />
      <Slider label="Size on screen" value={stamp.sizePx} min={8} max={400} log onChange={(v) => set({ stamp: { ...stamp, sizePx: v } })} format={(v) => `${Math.round(v)} px`} hint="[ and ] keys" />
      {stamp.mode === 'stamp' && (
        <>
          <Slider label="Spacing" value={stamp.spacingPx} min={6} max={300} log onChange={(v) => set({ stamp: { ...stamp, spacingPx: v } })} format={(v) => `${Math.round(v)} px`} />
          <Slider label="Random scale" value={stamp.randomScale} min={0} max={0.9} onChange={(v) => set({ stamp: { ...stamp, randomScale: v } })} format={(v) => `±${Math.round(v * 100)}%`} />
          <Slider label="Random rotation" value={stamp.randomRotation} min={0} max={180} step={1} onChange={(v) => set({ stamp: { ...stamp, randomRotation: v } })} format={(v) => `±${Math.round(v)}°`} />
          <Toggle label="Random mirroring" checked={stamp.randomFlip} onChange={(v) => set({ stamp: { ...stamp, randomFlip: v } })} />
        </>
      )}
      <Hint>Objects keep their size on the map: size is measured at the zoom where you place them. Drag assets straight from the library onto the map, too.</Hint>
    </>
  );
}

export function ToolOptions() {
  const st = useEditor();
  const tool = st.tool;
  const def = ALL_TOOLS.find((t) => t.id === tool);
  const group = brushGroupOf(tool);
  const style = STYLE_PRESETS[useDoc((s) => s.doc.view.style)];
  const peaks = useDoc((s) => s.doc.peaks);
  const suppressed = Object.values(peaks).filter((p) => p.mode === 'suppressed').length;
  return (
    <div className="tool-options">
      {def && <Hint>{def.help}</Hint>}
      {tool === 'paint' && (
        <div className="biome-grid">
          {BIOMES.map((b, i) => (
            <button key={b.id} className={'biome-swatch' + (st.biome === i ? ' on' : '')} onClick={() => st.set({ biome: i })} title={`${b.name} (${i + 1})`}>
              <i style={{ background: style.biomes[i] }} />
              <span>{b.name}</span>
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      )}
      {tool === 'flatten' && (
        <>
          <Segmented
            label="Target height"
            value={st.flattenMode}
            onChange={(v) => st.set({ flattenMode: v })}
            options={[
              { value: 'sample', label: 'Under cursor' },
              { value: 'fixed', label: 'Fixed' },
            ]}
          />
          {st.flattenMode === 'fixed' && (
            <MeasureField label="Height above sea level" kind="height" value={st.flattenHeight} min={-11000} max={10000} step={{ metric: 50, imperial: 100 }} onChange={(v) => st.set({ flattenHeight: v })} />
          )}
        </>
      )}
      {tool === 'erase' && (
        <div className="checks">
          <Toggle label="Painted biomes" checked={st.eraseTargets.biomes} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, biomes: v } })} />
          <Toggle label="Objects" checked={st.eraseTargets.objects} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, objects: v } })} />
          <Toggle label="River & road points" checked={st.eraseTargets.paths} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, paths: v } })} />
          <Toggle label="Labels" checked={st.eraseTargets.labels} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, labels: v } })} />
        </div>
      )}
      {tool === 'fog' ? <FogControls /> : group && <BrushControls group={group} />}
      {tool === 'ridge' && <Hint>Tip: drag slowly along the spine of the range; repeat strokes to push summits towards 10,000 m.</Hint>}
      {(tool === 'raise' || tool === 'lower') && <Hint>Raising is boosted below sea level so new land emerges quickly from the deep ocean floor.</Hint>}
      {tool === 'object' && <ObjectToolControls />}
      {(tool === 'river' || tool === 'road') && (
        <>
          <Slider
            label="Width"
            value={st.pathDefaults[tool].width}
            min={0.5}
            max={30}
            log
            onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, [tool]: { ...st.pathDefaults[tool], width: v } } })}
            format={(v) => `${v.toFixed(1)} px`}
          />
          <ColorField
            label="Colour"
            value={st.pathDefaults[tool].color}
            swatches={PATH_SWATCHES}
            onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, [tool]: { ...st.pathDefaults[tool], color: v } } })}
          />
          {tool === 'road' ? (
            <Select<RoadStyle>
              label="Line style"
              value={st.pathDefaults.road.style}
              options={[
                { value: 'dashed', label: 'Dashed track' },
                { value: 'solid', label: 'Paved' },
                { value: 'dotted', label: 'Footpath (dotted)' },
                { value: 'double', label: 'Highway (double)' },
              ]}
              onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, road: { ...st.pathDefaults.road, style: v } } })}
            />
          ) : (
            <Toggle label="Taper from source to mouth" checked={st.pathDefaults.river.taper} onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, river: { ...st.pathDefaults.river, taper: v } } })} />
          )}
        </>
      )}
      {tool === 'territory' && (
        <>
          <Select<TerritoryType>
            label="Type"
            value={st.territoryDefaults.type}
            options={TERRITORY_TYPES.map((t) => ({ value: t, label: TERRITORY_TYPE_LABELS[t] }))}
            onChange={(v) => st.set({ territoryDefaults: { ...st.territoryDefaults, type: v } })}
          />
          <ColorField label="Colour" value={st.territoryDefaults.color} swatches={SWATCHES} onChange={(v) => st.set({ territoryDefaults: { ...st.territoryDefaults, color: v } })} />
          <Select<BorderStyle>
            label="Border"
            value={st.territoryDefaults.borderStyle}
            options={[
              { value: 'dashed', label: 'Dashed' },
              { value: 'solid', label: 'Solid' },
              { value: 'dotted', label: 'Dotted' },
              { value: 'double', label: 'Double' },
            ]}
            onChange={(v) => st.set({ territoryDefaults: { ...st.territoryDefaults, borderStyle: v } })}
          />
        </>
      )}
      {tool === 'label' && (
        <>
          <Select<LabelFont>
            label="Font"
            value={st.labelDefaults.font}
            options={(Object.keys(FONT_LABEL) as LabelFont[]).map((f) => ({ value: f, label: FONT_LABEL[f] }))}
            onChange={(v) => st.set({ labelDefaults: { ...st.labelDefaults, font: v } })}
          />
          <Slider label="Size on screen" value={st.labelDefaults.sizePx} min={8} max={120} log onChange={(v) => st.set({ labelDefaults: { ...st.labelDefaults, sizePx: v } })} format={(v) => `${Math.round(v)} px`} />
          <ColorField label="Colour" value={st.labelDefaults.color} swatches={['#2d2216', '#5a2a1a', '#1d2731', '#ffffff', '#8f2a1e', '#2f5d9a']} onChange={(v) => st.set({ labelDefaults: { ...st.labelDefaults, color: v } })} />
        </>
      )}
      {tool === 'peak' && (
        <>
          <Hint>Peaks are detected automatically as the highest point within ~{formatLength(160, st.units)} and update as you sculpt.</Hint>
          {suppressed > 0 && (
            <button className="btn" onClick={() => restoreSuppressedPeaks()}>
              Restore {suppressed} removed peak{suppressed > 1 ? 's' : ''}
            </button>
          )}
        </>
      )}
      {tool === 'measure' && <Hint>Distances follow great circles on a sphere of the planet's radius, so they stay correct at any latitude and across the date line.</Hint>}
    </div>
  );
}

