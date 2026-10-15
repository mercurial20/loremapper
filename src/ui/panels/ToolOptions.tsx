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
import { brushGroupOf, TERRAIN_PRESETS, useEditor, type BrushGroup, type TerrainPreset } from '../../store/editorStore';
import { raiseRate, type BrushParams } from '../../terrain/brushes';
import { pushTileChange } from '../../tools/ToolController';
import { ALL_TOOLS } from '../toolDefs';
import { AlphaBadge, ColorField, Hint, MeasureField, Segmented, Select, Slider, Toggle } from '../controls/controls';
import { useTranslation } from 'react-i18next';

const SWATCHES = ['#b5452f', '#2f5d9a', '#3f8f5a', '#c79a2e', '#7a4aa0', '#2a8a8a', '#8f3a5c', '#5a5a5a'];
const PATH_SWATCHES = ['#4f86ad', '#2e5f86', '#6aa5c8', '#7a5532', '#4b3a2a', '#9a7b52', '#8a2e2e', '#2b2016'];

/** Kind-of-land presets for the raise brush: plains by default. */
function TerrainPresets() {
  const { t } = useTranslation();
  const preset = useEditor((s) => s.terrainPreset);
  const units = useEditor((s) => s.units);
  const b = useEditor((s) => s.brushes.terrain);
  const pick = (id: Exclude<TerrainPreset, 'custom'>) => {
    // presets without a ceiling clear it explicitly (setBrush merges)
    useEditor.getState().setBrush('terrain', { ceiling: undefined, ceilingVar: undefined, ...TERRAIN_PRESETS[id].params });
    useEditor.getState().set({ terrainPreset: id });
  };
  const current = preset === 'custom' ? null : TERRAIN_PRESETS[preset];
  const presetHint = (id: Exclude<TerrainPreset, 'custom'>) => {
    const c = TERRAIN_PRESETS[id].params.ceiling;
    return TERRAIN_PRESETS[id].hint(c === undefined ? '' : formatHeight(c, units));
  };
  return (
    <div className="terrain-presets">
      <Segmented
        label={t('Land to build')}
        value={preset}
        onChange={(v) => v !== 'custom' && pick(v)}
        options={[
          ...(Object.keys(TERRAIN_PRESETS) as Exclude<TerrainPreset, 'custom'>[]).map((id) => ({ value: id, label: t(TERRAIN_PRESETS[id].label), title: presetHint(id) })),
          ...(preset === 'custom' ? [{ value: 'custom' as const, label: t('Custom') }] : []),
        ]}
      />
      <Hint>
        {current ? presetHint(preset as Exclude<TerrainPreset, 'custom'>) : b.ceiling !== undefined ? t('Your own settings, levelling off near {h}.', { h: formatHeight(b.ceiling, units) }) : t('Your own settings.')}
      </Hint>
    </div>
  );
}

function BrushControls({ group, showOpacity = true }: { group: BrushGroup; showOpacity?: boolean }) {
  const { t } = useTranslation();
  const b = useEditor((s) => s.brushes[group]);
  const tool = useEditor((s) => s.tool);
  // moving a slider of the raise brush turns its preset into "custom"
  const setBrush = (g: BrushGroup, p: Partial<BrushParams>) => {
    useEditor.getState().setBrush(g, p);
    if (g === 'terrain' && tool === 'raise' && !('radiusKm' in p && Object.keys(p).length === 1)) useEditor.getState().set({ terrainPreset: 'custom' });
  };
  const units = useEditor((s) => s.units);
  useDoc((s) => s.meta);
  const range = editor.model ? brushRange(editor.model.geo, group) : { min: 5, max: 6000 };
  return (
    <>
      {tool === 'raise' && group === 'terrain' && <TerrainPresets />}
      <Slider
        label={t('Radius')}
        value={Math.min(range.max, Math.max(range.min, b.radiusKm))}
        min={range.min}
        max={range.max}
        log
        onChange={(v) => setBrush(group, { radiusKm: v })}
        format={(v) => formatLength(v, units)}
        hint={t('[ and ] keys, or Alt + mouse wheel')}
      />
      <Slider
        label={t('Strength')}
        value={b.strength}
        min={0.01}
        max={1}
        onChange={(v) => setBrush(group, { strength: v })}
        format={(v) => (tool === 'raise' || tool === 'lower' || tool === 'ridge' ? t('{h} per dab', { h: formatHeight(raiseRate(v), units) }) : `${Math.round(v * 100)}%`)}
        hint={t('Shift + [ / ]')}
      />
      <Slider label={t('Falloff (softness)')} value={b.falloff} min={0} max={1} onChange={(v) => setBrush(group, { falloff: v })} format={(v) => `${Math.round(v * 100)}%`} />
      {(tool === 'raise' || tool === 'lower') && (
        <Slider
          label={t('Edge roughness')}
          value={b.roughness ?? 0}
          min={0}
          max={1}
          onChange={(v) => setBrush(group, { roughness: v })}
          format={(v) => (v < 0.02 ? t('smooth') : `${Math.round(v * 100)}%`)}
          hint={t('Ragged, natural coastlines instead of round brush blobs')}
        />
      )}
      {showOpacity && (
        <Slider
          label={tool === 'raise' || tool === 'lower' || tool === 'ridge' ? t('Stroke cap (opacity)') : t('Opacity')}
          value={b.opacity}
          min={0.02}
          max={1}
          onChange={(v) => setBrush(group, { opacity: v })}
          format={(v) => (tool === 'raise' || tool === 'lower' || tool === 'ridge' ? (v >= 0.99 ? t('no limit') : `±${formatHeight(v * 21000, units)}`) : `${Math.round(v * 100)}%`)}
          hint={t('The most a single stroke can change: build plateaus with a low cap.')}
        />
      )}
    </>
  );
}

function FogControls() {
  const { t } = useTranslation();
  const fogMode = useEditor((s) => s.fogMode);
  const fogPreview = useEditor((s) => s.fogPreview);
  const set = useEditor((s) => s.set);
  const fillFog = (value: number) => {
    const m = editor.model;
    if (!m) return;
    const change = m.replaceLayer('fog', null, value);
    pushTileChange(change, value ? t('Cover map with fog') : t('Clear all fog'), m);
  };
  return (
    <>
      <Segmented
        value={fogMode}
        onChange={(v) => set({ fogMode: v })}
        options={[
          { value: 'hide', label: <><CloudFog size={14} /> {t('Hide')}</>, title: t('Paint fog over unexplored land') },
          { value: 'reveal', label: <><Sun size={14} /> {t('Reveal')}</>, title: t('Clear fog from explored areas') },
        ]}
      />
      <BrushControls group="fog" />
      <Hint>{t('Opacity sets fog density — paint at 50% for haze players can partly see through. Hold Shift/Alt to invert.')}</Hint>
      <div className="btn-row">
        <button className="btn" onClick={() => fillFog(255)}>{t('Cover entire map')}</button>
        <button className="btn" onClick={() => fillFog(0)}>{t('Clear all fog')}</button>
      </div>
      <Toggle label={t('See through fog (editor)')} checked={fogPreview} onChange={(v) => set({ fogPreview: v })} hint={t('Show hidden content dimmed. Turn off to preview exactly what players see.')} />
      {!fogPreview && (
        <Hint>
          <Eye size={12} /> {t('Player view: fogged areas are fully opaque.')}
        </Hint>
      )}
    </>
  );
}

function ObjectToolControls() {
  const { t } = useTranslation();
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
              <b>{t(a.name)}</b>
              <small>{t(a.category)}</small>
            </div>
          </>
        ) : (
          <div className="empty">{t('No asset chosen')}</div>
        )}
        <button className="btn" onClick={() => set({ assetPanelOpen: true })}>
          {t('Library…')}
        </button>
      </div>
      <Segmented
        value={stamp.mode}
        onChange={(v) => set({ stamp: { ...stamp, mode: v } })}
        options={[
          { value: 'single', label: t('Single'), title: t('Click to place one object') },
          { value: 'stamp', label: t('Stamp brush'), title: t('Drag to place many') },
        ]}
      />
      <Select
        label={t('Place on layer')}
        value={activeObjectLayer}
        options={layers.map((l) => ({ value: l.id, label: t(l.name) + (l.locked ? ' ' + t('(locked)') : '') }))}
        onChange={(v) => set({ activeObjectLayer: v })}
      />
      <Slider label={t('Size on screen')} value={stamp.sizePx} min={8} max={400} log onChange={(v) => set({ stamp: { ...stamp, sizePx: v } })} format={(v) => `${Math.round(v)} px`} hint={t('[ and ] keys')} />
      {stamp.mode === 'stamp' && (
        <>
          <Slider label={t('Spacing')} value={stamp.spacingPx} min={6} max={300} log onChange={(v) => set({ stamp: { ...stamp, spacingPx: v } })} format={(v) => `${Math.round(v)} px`} />
          <Slider label={t('Random scale')} value={stamp.randomScale} min={0} max={0.9} onChange={(v) => set({ stamp: { ...stamp, randomScale: v } })} format={(v) => `±${Math.round(v * 100)}%`} />
          <Slider label={t('Random rotation')} value={stamp.randomRotation} min={0} max={180} step={1} onChange={(v) => set({ stamp: { ...stamp, randomRotation: v } })} format={(v) => `±${Math.round(v)}°`} />
          <Toggle label={t('Random mirroring')} checked={stamp.randomFlip} onChange={(v) => set({ stamp: { ...stamp, randomFlip: v } })} />
        </>
      )}
      <Hint>{t('Objects keep their size on the map: size is measured at the zoom where you place them. Drag assets straight from the library onto the map, too.')}</Hint>
    </>
  );
}

export function ToolOptions() {
  const { t } = useTranslation();
  const st = useEditor();
  const tool = st.tool;
  const def = ALL_TOOLS.find((t) => t.id === tool);
  const group = brushGroupOf(tool);
  const style = STYLE_PRESETS[useDoc((s) => s.doc.view.style)];
  const peaks = useDoc((s) => s.doc.peaks);
  const suppressed = Object.values(peaks).filter((p) => p.mode === 'suppressed').length;
  return (
    <div className="tool-options">
      {def && <Hint>{t(def.help)}</Hint>}
      {tool === 'paint' && (
        <div className="biome-grid">
          {BIOMES.map((b, i) => (
            <button key={b.id} className={'biome-swatch' + (st.biome === i ? ' on' : '')} onClick={() => st.set({ biome: i })} title={`${t(b.name)} (${i + 1})`}>
              <i style={{ background: style.biomes[i] }} />
              <span>{t(b.name)}</span>
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      )}
      {tool === 'flatten' && (
        <>
          <Segmented
            label={t('Target height')}
            value={st.flattenMode}
            onChange={(v) => st.set({ flattenMode: v })}
            options={[
              { value: 'sample', label: t('Under cursor') },
              { value: 'fixed', label: t('Fixed') },
            ]}
          />
          {st.flattenMode === 'fixed' && (
            <MeasureField label={t('Height above sea level')} kind="height" value={st.flattenHeight} min={-11000} max={10000} step={{ metric: 50, imperial: 100 }} onChange={(v) => st.set({ flattenHeight: v })} />
          )}
        </>
      )}
      {tool === 'erase' && (
        <div className="checks">
          <Toggle label={t('Painted biomes')} checked={st.eraseTargets.biomes} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, biomes: v } })} />
          <Toggle label={t('Objects')} checked={st.eraseTargets.objects} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, objects: v } })} />
          <Toggle label={t('River & road points')} checked={st.eraseTargets.paths} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, paths: v } })} />
          <Toggle label={t('Labels')} checked={st.eraseTargets.labels} onChange={(v) => st.set({ eraseTargets: { ...st.eraseTargets, labels: v } })} />
        </div>
      )}
      {tool === 'river' && (
        <>
          <Segmented
            label={t('Draw rivers')}
            value={st.riverMode}
            onChange={(v) => st.set({ riverMode: v })}
            options={[
              {
                value: 'brush',
                label: (
                  <>
                    {t('Brush')}
                    <AlphaBadge tip={t('A new tool that is still being tested: it may work unstably or not quite right.')} />
                  </>
                ),
                title: t('Paint water exactly where you want it, any width; Shift or Alt erases'),
              },
              { value: 'path', label: t('Path'), title: t('A smooth line that tapers from source to mouth') },
            ]}
          />
          <Hint>{st.riverMode === 'brush' ? t('Paint rivers, streams and lakes like with a brush. Shift or Alt erases water.') : t('Drag to draw freehand, or click points and double-click / Enter to finish.')}</Hint>
          <Toggle
            label={t('Carve a valley')}
            checked={st.riverCarve}
            onChange={(v) => st.set({ riverCarve: v })}
            hint={t('The river cuts its bed until it runs downhill all the way to its mouth; valley sides settle to the slopes of the hills around, and lowland rivers get a floodplain. One undo removes it with the river.')}
          />
        </>
      )}
      {tool === 'fog' ? <FogControls /> : group && <BrushControls group={group} />}
      {tool === 'ridge' && <Hint>{t('Tip: drag slowly along the spine of the range; repeat strokes to push summits towards 10,000 m.')}</Hint>}
      {(tool === 'raise' || tool === 'lower') && <Hint>{t('Raising is boosted below sea level so new land emerges quickly from the deep ocean floor.')}</Hint>}
      {tool === 'object' && <ObjectToolControls />}
      {((tool === 'river' && st.riverMode === 'path') || tool === 'road') && (
        <>
          <Slider
            label={t('Width')}
            value={st.pathDefaults[tool].width}
            min={0.5}
            max={30}
            log
            onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, [tool]: { ...st.pathDefaults[tool], width: v } } })}
            format={(v) => `${v.toFixed(1)} px`}
          />
          <ColorField
            label={t('Colour')}
            value={st.pathDefaults[tool].color}
            swatches={PATH_SWATCHES}
            onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, [tool]: { ...st.pathDefaults[tool], color: v } } })}
          />
          {tool === 'road' ? (
            <Select<RoadStyle>
              label={t('Line style')}
              value={st.pathDefaults.road.style}
              options={[
                { value: 'dashed', label: t('Dashed track') },
                { value: 'solid', label: t('Paved') },
                { value: 'dotted', label: t('Footpath (dotted)') },
                { value: 'double', label: t('Highway (double)') },
              ]}
              onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, road: { ...st.pathDefaults.road, style: v } } })}
            />
          ) : (
            <Toggle label={t('Taper from source to mouth')} checked={st.pathDefaults.river.taper} onChange={(v) => st.set({ pathDefaults: { ...st.pathDefaults, river: { ...st.pathDefaults.river, taper: v } } })} />
          )}
        </>
      )}
      {tool === 'territory' && (
        <>
          <Select<TerritoryType>
            label={t('Type')}
            value={st.territoryDefaults.type}
            options={TERRITORY_TYPES.map((x) => ({ value: x, label: t(TERRITORY_TYPE_LABELS[x]) }))}
            onChange={(v) => st.set({ territoryDefaults: { ...st.territoryDefaults, type: v } })}
          />
          <ColorField label={t('Colour')} value={st.territoryDefaults.color} swatches={SWATCHES} onChange={(v) => st.set({ territoryDefaults: { ...st.territoryDefaults, color: v } })} />
          <Select<BorderStyle>
            label={t('Border')}
            value={st.territoryDefaults.borderStyle}
            options={[
              { value: 'dashed', label: t('Dashed') },
              { value: 'solid', label: t('Solid') },
              { value: 'dotted', label: t('Dotted') },
              { value: 'double', label: t('Double') },
            ]}
            onChange={(v) => st.set({ territoryDefaults: { ...st.territoryDefaults, borderStyle: v } })}
          />
        </>
      )}
      {tool === 'label' && (
        <>
          <Select<LabelFont>
            label={t('Font')}
            value={st.labelDefaults.font}
            options={(Object.keys(FONT_LABEL) as LabelFont[]).map((f) => ({ value: f, label: t(FONT_LABEL[f]) }))}
            onChange={(v) => st.set({ labelDefaults: { ...st.labelDefaults, font: v } })}
          />
          <Slider label={t('Size on screen')} value={st.labelDefaults.sizePx} min={8} max={120} log onChange={(v) => st.set({ labelDefaults: { ...st.labelDefaults, sizePx: v } })} format={(v) => `${Math.round(v)} px`} />
          <ColorField label={t('Colour')} value={st.labelDefaults.color} swatches={['#2d2216', '#5a2a1a', '#1d2731', '#ffffff', '#8f2a1e', '#2f5d9a']} onChange={(v) => st.set({ labelDefaults: { ...st.labelDefaults, color: v } })} />
        </>
      )}
      {tool === 'peak' && (
        <>
          <Hint>{t('Peaks are detected automatically as the highest point nearby and update as you sculpt.')}</Hint>
          {suppressed > 0 && (
            <button className="btn" onClick={() => restoreSuppressedPeaks()}>
              {t('Restore removed peaks ({n})', { n: suppressed })}
            </button>
          )}
        </>
      )}
      {tool === 'measure' && <Hint>{t('Distances follow great circles on a sphere of the planet\'s radius, so they stay correct at any latitude and across the date line.')}</Hint>}
    </div>
  );
}

