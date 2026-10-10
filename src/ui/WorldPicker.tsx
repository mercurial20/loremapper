import { ArrowLeft, Castle, ExternalLink, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { COMMUNITY_LINKS } from '../community';
import { flatMap } from '../core/planet';
import { formatLength } from '../core/units';
import { editor } from '../editor/Editor';
import { generateWorld } from '../editor/generate';
import { addWorldFeatures } from '../editor/worldFeatures';
import { WORLD_PRESETS, type WorldPreset } from '../presets/worlds';
import { useEditor } from '../store/editorStore';
import { TextField } from './controls/controls';

/** A small drawing of a world's sketch: land, seas, ranges and volcanoes. */
function SketchThumb({ preset }: { preset: WorldPreset }) {
  const w = 100;
  const h = Math.round((100 * preset.map.heightKm) / preset.map.widthKm);
  const pts = (p: [number, number][]) => p.map(([u, v]) => `${(u * w).toFixed(1)},${(v * h).toFixed(1)}`).join(' ');
  const sk = preset.sketch;
  return (
    <svg className="world-thumb" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <rect width={w} height={h} className="sea" />
      {sk.land.map((p, i) => (
        <polygon key={i} points={pts(p)} className="land" />
      ))}
      {(sk.sea ?? []).map((p, i) => (
        <polygon key={i} points={pts(p)} className="sea" />
      ))}
      {(sk.ranges ?? []).map((r, i) => (
        <polyline key={i} points={pts(r.pts)} className={'range' + (r.old ? ' old' : '')} style={{ strokeWidth: Math.max(1, r.width * w * 0.5) }} />
      ))}
      {(sk.volcanoes ?? []).map(([u, v, s], i) => (
        <circle key={i} cx={u * w} cy={v * h} r={0.8 + 1.4 * s} className="volcano" />
      ))}
    </svg>
  );
}

/**
 * Pick a built-in world and create it: a map of the preset's size, generated
 * from its sketch. `sample` lets the read-only viewer build one to explore.
 */
export function WorldPicker({ onBack, onCreated, sample }: { onBack: () => void; onCreated?: () => void; sample?: boolean }) {
  const units = useEditor((s) => s.units);
  const [pick, setPick] = useState<WorldPreset>(WORLD_PRESETS[0]);
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setWorking(true);
    setError(null);
    try {
      const m = pick.map;
      await editor.createMap(name.trim() || pick.name, { ...flatMap(m.widthKm, m.heightKm, 'standard'), maxElevation: m.maxElevation }, { source: `world:${pick.id}` });
      onCreated?.();
      const o = pick.options;
      await generateWorld(
        {
          type: 'continents',
          template: 'none',
          realism: 'medium',
          seed: 1,
          landFraction: 0.35,
          mountains: 0.75,
          roughness: 0.4,
          warmth: 0,
          wetness: 0,
          biomes: true,
          rivers: 'normal',
          settlements: true,
          region: 'world',
          ...o,
          sketch: pick.sketch,
        },
        { sample },
      );
      if (pick.features) addWorldFeatures(pick.features);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="new-map">
      <h3 className="gen-h">Start from a built-in world</h3>
      <div className="world-cards">
        {WORLD_PRESETS.map((p) => (
          <button key={p.id} className={'world-card' + (p.id === pick.id ? ' on' : '')} onClick={() => setPick(p)} aria-pressed={p.id === pick.id}>
            <SketchThumb preset={p} />
            <b>{p.name}</b>
            <small>{p.tagline}</small>
          </button>
        ))}
      </div>
      <div className="world-detail">
        <p>{pick.description}</p>
        <p className="hint">
          A flat map of {formatLength(pick.map.widthKm, units)} × {formatLength(pick.map.heightKm, units)}. The generator builds its relief, rivers, climate and towns, so
          you can reshape everything afterwards.
          {pick.local && ' Kept on this computer only.'}
        </p>
      </div>
      {!sample && <TextField label="Name" value={name} placeholder={pick.name} onChange={setName} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="new-map-foot">
        <button className="btn ghost small" onClick={onBack} disabled={working}>
          <ArrowLeft size={13} /> Back
        </button>
        <a className="btn ghost small" href={COMMUNITY_LINKS.suggestWorld.href} target="_blank" rel="noopener noreferrer" title={COMMUNITY_LINKS.suggestWorld.title}>
          {COMMUNITY_LINKS.suggestWorld.label} <ExternalLink size={12} />
        </a>
        <button className="btn primary" onClick={create} disabled={working}>
          {working ? <LoaderCircle size={14} className="spin" /> : <Castle size={14} />} Create {pick.name}
        </button>
      </div>
    </div>
  );
}
