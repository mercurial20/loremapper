import { FileArchive, Image, Mountain } from 'lucide-react';
import { useState } from 'react';
import { exportHeightmap, exportImage, exportProject, exportSize, type FogExport } from '../../editor/exporter';
import { useEditor } from '../../store/editorStore';
import { useDoc } from '../../store/docStore';
import { Segmented, Toggle } from '../controls/controls';
import { Modal } from './Modal';
import { shouldOfferShare } from '../share';

const WIDTHS = [1024, 2048, 4096, 8192, 12288];

export function ExportDialog() {
  const set = useEditor((s) => s.set);
  const notify = useEditor((s) => s.notify);
  const meta = useDoc((s) => s.meta);
  const [tab, setTab] = useState<'image' | 'height' | 'project'>('image');
  const [region, setRegion] = useState<'world' | 'view'>('view');
  const [width, setWidth] = useState(4096);
  const [fog, setFog] = useState<FogExport>('none');
  const [peaks, setPeaks] = useState(true);
  const [bits, setBits] = useState<'16' | '8'>('16');
  const [hmWidth, setHmWidth] = useState(meta?.planet.gridWidth ?? 4096);
  const flat = meta?.planet.mapType === 'flat';
  const close = () => set({ dialog: null });
  const size = exportSize({ region, width });
  const mp = (size.width * size.height) / 1e6;
  const run = async (fn: () => Promise<void>, offerShare = false) => {
    close();
    try {
      await fn();
      if (offerShare && shouldOfferShare()) set({ dialog: 'share' });
    } catch (e) {
      notify('Export failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  };
  return (
    <Modal title="Export" onClose={close} wide>
      <div className="export-tabs">
        <button className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}>
          <Image size={18} />
          <b>Map image</b>
          <small>Flattened PNG for sharing or printing — cannot be edited again.</small>
        </button>
        <button className={tab === 'height' ? 'on' : ''} onClick={() => setTab('height')}>
          <Mountain size={18} />
          <b>Heightmap</b>
          <small>Greyscale elevation for game engines and 3D tools.</small>
        </button>
        <button className={tab === 'project' ? 'on' : ''} onClick={() => setTab('project')}>
          <FileArchive size={18} />
          <b>Editable project</b>
          <small>Everything — terrain, objects, fog, your custom assets. Re-import to keep editing.</small>
        </button>
      </div>
      {tab === 'image' && (
        <div className="export-body">
          <Segmented
            label="Area"
            value={region}
            onChange={setRegion}
            options={[
              { value: 'view', label: 'Current view' },
              { value: 'world', label: flat ? 'Whole map' : 'Whole planet' },
            ]}
          />
          <Segmented label="Width" value={String(width)} onChange={(v) => setWidth(Number(v))} options={WIDTHS.map((w) => ({ value: String(w), label: `${w}px` }))} />
          <Segmented
            label="Fog of war"
            value={fog}
            onChange={setFog}
            options={[
              { value: 'none', label: 'Complete map (no fog)' },
              { value: 'revealed', label: 'Revealed areas only (player map)' },
            ]}
          />
          <Toggle label="Include peak markers" checked={peaks} onChange={setPeaks} />
          <p className="hint">
            Output: {size.width.toLocaleString()} × {size.height.toLocaleString()} px ({mp.toFixed(1)} MP). Large images are rendered in tiles and may take a moment.
          </p>
          <div className="btn-row end">
            <button className="btn primary" disabled={mp > 160} onClick={() => run(() => exportImage({ region, width, fog, includePeaks: peaks }), true)}>
              <Image size={14} /> Export PNG
            </button>
          </div>
        </div>
      )}
      {tab === 'height' && (
        <div className="export-body">
          <Segmented
            label="Bit depth"
            value={bits}
            onChange={setBits}
            options={[
              { value: '16', label: '16-bit (recommended)' },
              { value: '8', label: '8-bit' },
            ]}
          />
          <Segmented
            label="Width"
            value={String(hmWidth)}
            onChange={(v) => setHmWidth(Number(v))}
            options={[1024, 2048, meta?.planet.gridWidth ?? 4096].filter((v, i, a) => a.indexOf(v) === i).map((w) => ({ value: String(w), label: `${w}px` }))}
          />
          <p className="hint">
            {flat ? 'Whole map, top-down at a uniform scale.' : 'Whole planet, equirectangular.'} Black = {meta?.planet.minElevation.toLocaleString()} m, white ={' '}
            {((meta?.planet.seaLevel ?? 0) + (meta?.planet.maxElevation ?? 10000)).toLocaleString()} m (range is in the file name and PNG metadata; heights are always stored in metres). 16-bit avoids terracing.
          </p>
          <div className="btn-row end">
            <button className="btn primary" onClick={() => run(() => exportHeightmap(bits === '16' ? 16 : 8, hmWidth))}>
              <Mountain size={14} /> Export heightmap
            </button>
          </div>
        </div>
      )}
      {tab === 'project' && (
        <div className="export-body">
          <p>
            Saves <b>{meta?.name}</b> as a single <code>.loremap</code> file (a zip archive) containing the elevation, biome and fog tiles, every object, path,
            territory, label and peak, plus the image files of custom assets it uses. Import it from <i>Maps → Import project file</i> on any browser.
          </p>
          <p className="hint">Your work is already saved automatically in this browser — use this for backups and moving between computers.</p>
          <div className="btn-row end">
            <button className="btn primary" onClick={() => run(exportProject)}>
              <FileArchive size={14} /> Export project
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
