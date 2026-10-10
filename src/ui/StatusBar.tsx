import { BIOMES } from '../core/planet';
import { formatArea, formatHeight, formatLatLon, formatLength, formatPosition, kmToDisplay, KM_PER_MI } from '../core/units';
import { editor } from '../editor/Editor';
import { defaultName, freshGeography, kindLabel, regionAt, regionName } from '../editor/geography';
import { useDoc } from '../store/docStore';
import { useEditor, useViewInfo } from '../store/editorStore';

const NICE = [1, 2, 5];
/** Largest 1 / 2 / 5 × 10ⁿ not above v. */
function nice(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  let best = p;
  for (const n of NICE) if (n * p <= v) best = n * p;
  return best;
}

/**
 * Scale bar in the display units. On planets it holds for the latitude at
 * the centre of the view (the equirectangular map stretches with latitude).
 */
export function ScaleBar() {
  const { zoom, centerY } = useViewInfo();
  const meta = useDoc((s) => s.meta);
  const units = useEditor((s) => s.units);
  const model = editor.model;
  if (!model || !meta) return null;
  const geo = model.geo;
  const y = Math.min(model.H - 1, Math.max(1, centerY));
  const kmPerPx = Math.abs(geo.kmPerCellX(y)) / zoom;
  // a round length in the display units, about 140 px long
  const target = kmToDisplay(140 * kmPerPx, units);
  let len = nice(target);
  let km = units === 'imperial' ? len * KM_PER_MI : len;
  // below a mile (or a km) switch to feet (or metres) so the bar stays round
  if (units === 'imperial' && target < 1) {
    len = nice((target * KM_PER_MI * 1000) / 0.3048);
    km = (len * 0.3048) / 1000;
  } else if (units === 'metric' && target < 1) {
    len = nice(target * 1000);
    km = len / 1000;
  }
  const px = km / kmPerPx;
  const lat = geo.lat(y);
  return (
    <div className="scalebar" aria-label="Scale">
      <div className="scale-ticks" style={{ width: px }}>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="scale-label">
        <span>0</span>
        <span>{formatLength(km, units)}</span>
      </div>
      {!geo.flat && (
        <small>
          at {Math.abs(lat).toFixed(0)}°{lat >= 0 ? 'N' : 'S'} · N–S: {formatLength((geo.kmPerCellY / zoom) * 100, units)} per 100 px
        </small>
      )}
    </div>
  );
}

/** Info tool: name, kind and size of the landmass or water body under the cursor. */
function RegionUnderCursor({ x, y }: { x: number; y: number }) {
  const tool = useEditor((s) => s.tool);
  const geography = useEditor((s) => s.geography);
  const busy = useEditor((s) => s.geoBusy);
  const units = useEditor((s) => s.units);
  const names = useDoc((s) => s.doc.regionNames);
  if (tool !== 'info') return null;
  const g = freshGeography();
  if (!g || !geography) return <span className="sb-item muted">{busy ? 'Measuring lands and seas…' : ''}</span>;
  const r = regionAt(g, x, y);
  if (!r) return null;
  const name = regionName(g, r, names)?.name || defaultName(geography, r);
  return (
    <span className={'sb-item region ' + (r.land ? 'land' : 'sea')}>
      <b>{name}</b>
      {name.startsWith(kindLabel(r.kind)) || r.kind === 'ocean' ? '' : ` · ${kindLabel(r.kind)}`} · {formatArea(r.areaKm2, units)}
    </span>
  );
}

export function StatusBar() {
  const cursor = useEditor((s) => s.cursor);
  const stats = useEditor((s) => s.landStats);
  const zoom = useViewInfo((s) => s.zoom);
  const meta = useDoc((s) => s.meta);
  const units = useEditor((s) => s.units);
  const readOnly = useEditor((s) => s.readOnly);
  const model = editor.model;
  const geo = model?.geo;
  const kmPerPx = geo ? geo.kmPerCellY / zoom : 0;
  return (
    <footer className="statusbar">
      {cursor ? (
        <>
          <span className="sb-item mono">{geo?.flat ? formatPosition(...geo.posKm(cursor.x, cursor.y), units) : formatLatLon(cursor.lat, cursor.lon)}</span>
          <span className={'sb-item ' + (cursor.elevation >= 0 ? 'land' : 'sea')}>
            {cursor.elevation >= 0 ? '▲ ' + formatHeight(cursor.elevation, units) + ' a.s.l.' : '▼ ' + formatHeight(-cursor.elevation, units) + ' deep'}
          </span>
          <span className="sb-item">{cursor.elevation >= 0 ? (cursor.biome >= 0 ? BIOMES[cursor.biome].name : 'Unpainted land') : 'Water'}</span>
          {cursor.fog > 0.02 && <span className="sb-item">Fog {Math.round(cursor.fog * 100)}%</span>}
          <RegionUnderCursor x={cursor.x} y={cursor.y} />
        </>
      ) : (
        <span className="sb-item muted">{readOnly ? 'Tap the map to see what is there' : 'Move over the map to inspect elevation and coordinates'}</span>
      )}
      <span className="spacer" />
      {stats && meta && (
        <span className="sb-item" title={geo?.flat ? 'Land share of the whole map' : 'Measured on the sphere: each cell is weighted by its true surface area'}>
          {stats.areaKm2 > 0
            ? `Land ${(stats.fraction * 100).toFixed(1)}% · ${formatArea(stats.areaKm2, units)} · highest ${formatHeight(Math.max(0, stats.highest), units)}`
            : 'All water — raise land or use Generate'}
        </span>
      )}
      <span className="sb-item mono" title="Ground distance per screen pixel (north–south)">1 px ≈ {formatLength(kmPerPx, units)}</span>
      {meta && (
        <span className="sb-item muted" title={geo?.flat ? 'Flat map' : 'Planet'}>
          {geo?.flat
            ? `${formatLength(geo.W * geo.cellKm, units)} × ${formatLength(geo.H * geo.cellKm, units)}`
            : `R ${formatLength(meta.planet.radiusKm, units)}`}{' '}
          · {meta.planet.gridWidth}×{meta.planet.gridHeight}
        </span>
      )}
    </footer>
  );
}
