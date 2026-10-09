import { Dices, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { seedFromString } from '../../core/math';
import { generateWorld, type GenerateOptions } from '../../editor/generate';
import type { GenType } from '../../terrain/generator';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { Segmented, Slider, TextField, Toggle } from '../controls/controls';
import { Modal } from './Modal';

const TYPES: { value: GenType; label: string; desc: string }[] = [
  { value: 'continents', label: 'Continents', desc: 'Several landmasses around the whole planet (replaces the map).' },
  { value: 'pangaea', label: 'Supercontinent', desc: 'One great landmass and scattered isles (replaces the map).' },
  { value: 'island', label: 'Island', desc: 'A single island in the current view, added to what is there.' },
  { value: 'archipelago', label: 'Archipelago', desc: 'A chain of small islands in the current view, added to what is there.' },
];

function randomSeed() {
  const words = ['amber', 'basalt', 'cinder', 'drake', 'ember', 'fjord', 'gale', 'hollow', 'ivory', 'jade', 'kestrel', 'lumen', 'mire', 'north', 'onyx', 'pale', 'quartz', 'rune', 'sable', 'thorn'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${w()}-${Math.floor(Math.random() * 1000)}`;
}

export function GenerateDialog() {
  const set = useEditor((s) => s.set);
  const planet = useDoc((s) => s.meta?.planet);
  const [type, setType] = useState<GenType>('continents');
  const [seed, setSeed] = useState(randomSeed());
  const [land, setLand] = useState(planet?.landFraction ?? 0.29);
  const [islandLand, setIslandLand] = useState(0.35);
  const [mountains, setMountains] = useState(0.75);
  const [rough, setRough] = useState(0.5);
  const [biomes, setBiomes] = useState(true);
  const [rivers, setRivers] = useState(true);
  const [settlements, setSettlements] = useState(false);
  const close = () => set({ dialog: null });
  const whole = type === 'continents' || type === 'pangaea';
  const t = TYPES.find((x) => x.value === type)!;
  const go = () => {
    const o: GenerateOptions = {
      type,
      seed: /^\d+$/.test(seed) ? Number(seed) : seedFromString(seed),
      landFraction: whole ? land : islandLand,
      mountains,
      roughness: rough,
      biomes,
      rivers,
      settlements,
      region: whole ? 'world' : 'view',
    };
    close();
    void generateWorld(o);
  };
  return (
    <Modal
      title="Generate terrain"
      onClose={close}
      footer={
        <div className="btn-row end">
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={go}>
            <WandSparkles size={14} /> Generate
          </button>
        </div>
      }
    >
      <Segmented value={type} onChange={setType} options={TYPES.map((x) => ({ value: x.value, label: x.label }))} />
      <p className="hint">{t.desc} You can undo generation, then keep sculpting by hand.</p>
      <div className="seed-row">
        <TextField label="Seed" value={seed} onChange={setSeed} />
        <button className="icon-btn" title="Random seed" onClick={() => setSeed(randomSeed())}>
          <Dices size={18} />
        </button>
      </div>
      {whole ? (
        <Slider label="Land (true surface area)" value={land} min={0.05} max={0.7} onChange={setLand} format={(v) => `${Math.round(v * 100)}% · ${((v * (planet ? 4 * Math.PI * planet.radiusKm ** 2 : 690e6)) / 1e6).toFixed(0)}M km²`} />
      ) : (
        <Slider label="Land in view" value={islandLand} min={0.08} max={0.7} onChange={setIslandLand} format={(v) => `${Math.round(v * 100)}%`} />
      )}
      <Slider label="Mountain height" value={mountains} min={0} max={1} onChange={setMountains} format={(v) => `up to ${Math.round(v * 9500).toLocaleString()} m`} />
      <Slider label="Ruggedness" value={rough} min={0} max={1} onChange={setRough} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label="Paint biomes by climate" checked={biomes} onChange={setBiomes} />
      <Toggle label="Trace rivers downhill" checked={rivers} onChange={setRivers} />
      <Toggle label="Scatter named settlements" checked={settlements} onChange={setSettlements} />
    </Modal>
  );
}
