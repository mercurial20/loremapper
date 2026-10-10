import { List, LoaderCircle, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { editor } from '../../editor/Editor';
import {
  defaultName,
  ensureGeography,
  formatArea,
  formatDistance,
  formatHeight,
  freshGeography,
  kindLabel,
  labelRegion,
  realmsOn,
  regionName,
  setRegionName,
  setUnits,
  showRegion,
} from '../../editor/geography';
import { formatLength } from '../../core/units';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import type { RegionInfo } from '../../terrain/geography';
import { Hint, Segmented, TextField } from '../controls/controls';

const lat = (y: number) => {
  const H = editor.model?.H ?? 1;
  const d = 90 - (y / H) * 180;
  return `${Math.abs(d).toFixed(0)}°${d >= 0 ? 'N' : 'S'}`;
};

/** Metric (km, m) or imperial (mi, ft) for every size shown in the geography panels. */
export function UnitsToggle({ compact }: { compact?: boolean }) {
  const units = useEditor((s) => s.units);
  return (
    <Segmented
      value={units}
      onChange={setUnits}
      options={[
        { value: 'metric', label: compact ? 'Metric' : 'Metric · km, m', title: 'Kilometres, square kilometres and metres' },
        { value: 'imperial', label: compact ? 'Imperial' : 'Imperial · mi, ft', title: 'Miles, square miles and feet' },
      ]}
    />
  );
}

/** Facts about the landmass or body of water the user clicked. */
export function RegionInspector({ r }: { r: RegionInfo }) {
  const geography = useEditor((s) => s.geography)!;
  const units = useEditor((s) => s.units);
  const peaks = useEditor((s) => s.peaks);
  const names = useDoc((s) => s.doc.regionNames);
  useDoc((s) => s.doc.territories);
  const g = freshGeography();
  const pinned = g ? regionName(g, r, names) : null;
  const placeholder = defaultName(geography, r);
  const share = r.land ? r.areaKm2 / Math.max(1, geography.landKm2) : r.areaKm2 / geography.mapKm2;
  const peak = r.land ? peaks.find((p) => p.name && Math.hypot(p.x - r.extremeX, p.y - r.extremeY) < 6) : undefined;
  const W = editor.model?.W ?? 1;
  const flat = !!editor.model?.geo.flat;
  const cellKm = editor.model?.geo.cellKm ?? 1;
  const lonSpan = Math.min(360, ((r.x1 - r.x0) / W) * 360);
  const realms = g && r.land ? realmsOn(g, r) : [];
  return (
    <>
      <TextField label="Name" value={pinned?.name ?? ''} placeholder={placeholder} onChange={(v) => setRegionName(r, v)} />
      <div className="region-area">
        <b>{formatArea(r.areaKm2, units)}</b>
        <span>
          {(share * 100).toFixed(share < 0.01 ? 2 : 1)}% of {r.land ? 'all land' : 'the planet'}
        </span>
      </div>
      <UnitsToggle />
      <div className="kv">
        <span>Type</span>
        <b>{kindLabel(r.kind)}</b>
      </div>
      <div className="kv">
        <span>Coastline</span>
        <b>≈ {formatDistance(r.coastKm, units)}</b>
      </div>
      <div className="kv">
        <span>{r.land ? 'Highest point' : 'Deepest point'}</span>
        <b>
          {formatHeight(Math.abs(r.extreme), units)}
          {peak ? ` · ${peak.name}` : ''}
        </b>
      </div>
      <div className="kv">
        <span>{r.land ? 'Mean elevation' : 'Mean depth'}</span>
        <b>{formatHeight(Math.abs(r.mean), units)}</b>
      </div>
      {r.kind !== 'ocean' && (
        <div className="kv">
          <span>{flat ? 'Extent' : 'Spans'}</span>
          <b>
            {flat
              ? `${formatLength((r.x1 - r.x0) * cellKm, units)} × ${formatLength((r.y1 - r.y0) * cellKm, units)}`
              : `${lat(r.y0)} – ${lat(r.y1)} · ${lonSpan.toFixed(0)}° of longitude`}
          </b>
        </div>
      )}
      {realms.length > 0 && (
        <div className="kv">
          <span>Realms</span>
          <b>{realms.join(', ')}</b>
        </div>
      )}
      <div className="btn-row">
        <button className="btn small" onClick={() => labelRegion(r, pinned?.name || placeholder)} title="Add the name to the map as a label you can move and style">
          <Type size={13} /> Write name on map
        </button>
        <button className="btn small" onClick={() => useEditor.getState().set({ geoListOpen: true })}>
          <List size={13} /> All lands & seas
        </button>
      </div>
      <Hint>Areas are measured on the sphere. The coastline length depends on the map's resolution, like real coastlines.</Hint>
    </>
  );
}

/** Every landmass (or body of water), largest first. */
export function LandsList() {
  const geography = useEditor((s) => s.geography);
  const busy = useEditor((s) => s.geoBusy);
  const units = useEditor((s) => s.units);
  const inspect = useEditor((s) => s.inspect);
  const names = useDoc((s) => s.doc.regionNames);
  const [tab, setTab] = useState<'land' | 'water'>('land');
  const [showSmall, setShowSmall] = useState(false);
  useEffect(() => {
    void ensureGeography();
  });
  if (!geography) {
    return (
      <p className="hint">
        <LoaderCircle className="spin" size={13} /> Measuring the map…
      </p>
    );
  }
  const g = freshGeography();
  const count = (k: RegionInfo['kind']) => geography.land.filter((r) => r.kind === k).length;
  const list = tab === 'land' ? geography.land : geography.water;
  const small = (r: RegionInfo) => r.kind === 'islet' || r.kind === 'lake';
  const shown = list.filter((r) => showSmall || !small(r));
  const hidden = list.length - shown.length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <>
      <p className="hint">
        {plural(count('continent'), 'continent', 'continents')} · {plural(count('island'), 'island', 'islands')} · {plural(count('islet'), 'islet', 'islets')}
        <br />
        Land {((geography.landKm2 / geography.mapKm2) * 100).toFixed(1)}% · {formatArea(geography.landKm2, units)}
        {busy && (
          <>
            {' '}
            <LoaderCircle className="spin" size={11} />
          </>
        )}
      </p>
      <div className="grid2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'land', label: 'Land' },
            { value: 'water', label: 'Water' },
          ]}
        />
        <UnitsToggle compact />
      </div>
      <ul className="region-list">
        {shown.map((r) => {
          const on = inspect?.land === r.land && inspect.id === r.id;
          const name = (g && regionName(g, r, names)?.name) || defaultName(geography, r);
          return (
            <li key={`${r.land}-${r.id}`}>
              <button className={on ? 'on' : ''} onClick={() => showRegion(r)} title="Show on the map">
                <span className="region-name">
                  {name}
                  <small>{kindLabel(r.kind)}</small>
                </span>
                <span className="region-size">{formatArea(r.areaKm2, units)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button className="btn small" onClick={() => setShowSmall(true)}>
          Show {hidden} smaller {tab === 'land' ? 'islets' : 'lakes'}
        </button>
      )}
      <Hint>Click land or water on the map with the Select tool (V) to see its size.</Hint>
    </>
  );
}
