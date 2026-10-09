import { formatKm, formatLatLon, formatMeters } from '../core/geo';
import { BIOMES } from '../core/planet';
import { editor } from '../editor/Editor';
import { useDoc } from '../store/docStore';
import { useEditor, useViewInfo } from '../store/editorStore';

const NICE = [1, 2, 5];
function niceKm(km: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(km)));
  let best = p;
  for (const n of NICE) if (n * p <= km) best = n * p;
  return best;
}

/** Scale bar for the latitude at the centre of the view (equirectangular stretches with latitude). */
export function ScaleBar() {
  const { zoom, centerY } = useViewInfo();
  const meta = useDoc((s) => s.meta);
  const model = editor.model;
  if (!model || !meta) return null;
  const geo = model.geo;
  const y = Math.min(model.H - 1, Math.max(1, centerY));
  const kmPerPx = Math.abs(geo.kmPerCellX(y)) / zoom;
  const target = 140 * kmPerPx;
  const km = niceKm(target);
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
        <span>{formatKm(km)}</span>
      </div>
      <small>
        at {Math.abs(lat).toFixed(0)}°{lat >= 0 ? 'N' : 'S'} · N–S: {formatKm((geo.kmPerCellY / zoom) * 100)} per 100 px
      </small>
    </div>
  );
}

export function StatusBar() {
  const cursor = useEditor((s) => s.cursor);
  const stats = useEditor((s) => s.landStats);
  const zoom = useViewInfo((s) => s.zoom);
  const meta = useDoc((s) => s.meta);
  const model = editor.model;
  const kmPerPx = model ? model.geo.kmPerCellY / zoom : 0;
  return (
    <footer className="statusbar">
      {cursor ? (
        <>
          <span className="sb-item mono">{formatLatLon(cursor.lat, cursor.lon)}</span>
          <span className={'sb-item ' + (cursor.elevation >= 0 ? 'land' : 'sea')}>
            {cursor.elevation >= 0 ? '▲ ' + formatMeters(cursor.elevation) + ' a.s.l.' : '▼ ' + formatMeters(-cursor.elevation) + ' deep'}
          </span>
          <span className="sb-item">{cursor.elevation >= 0 ? (cursor.biome >= 0 ? BIOMES[cursor.biome].name : 'Unpainted land') : 'Ocean'}</span>
          {cursor.fog > 0.02 && <span className="sb-item">Fog {Math.round(cursor.fog * 100)}%</span>}
        </>
      ) : (
        <span className="sb-item muted">Move over the map to inspect elevation and coordinates</span>
      )}
      <span className="spacer" />
      {stats && meta && (
        <span className="sb-item" title="Measured on the sphere: each cell is weighted by its true surface area">
          {stats.areaKm2 > 0
            ? `Land ${(stats.fraction * 100).toFixed(1)}% · ${(stats.areaKm2 / 1e6).toFixed(1)}M km² · highest ${formatMeters(Math.max(0, stats.highest))}`
            : 'All ocean — raise land or use Generate'}
        </span>
      )}
      <span className="sb-item mono" title="Ground distance per screen pixel (north–south)">1 px ≈ {formatKm(kmPerPx)}</span>
      {meta && (
        <span className="sb-item muted" title="Planet">
          R {meta.planet.radiusKm.toLocaleString()} km · {meta.planet.gridWidth}×{meta.planet.gridHeight}
        </span>
      )}
    </footer>
  );
}
