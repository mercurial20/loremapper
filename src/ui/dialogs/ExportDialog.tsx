import { FileArchive, Image, Mountain } from 'lucide-react';
import { useState } from 'react';
import { exportHeightmap, exportImage, exportProject, exportSize, type FogExport } from '../../editor/exporter';
import { useEditor } from '../../store/editorStore';
import { useDoc } from '../../store/docStore';
import { PROJECTIONS, type ProjectionId, type ProjectionParams } from '../../core/projections';
import { exportProjectedImage, projectedSize } from '../../editor/projectedExport';
import { Segmented, Select, Slider, Toggle } from '../controls/controls';
import { ProjectionPreview } from './ProjectionPreview';
import { Modal } from './Modal';
import { shouldOfferShare } from '../share';
import { assetLibrary } from '../../assets/library';
import { setReference } from '../../editor/commands';
import { track, type EventProps } from '../../analytics';

const WIDTHS = [1024, 2048, 4096, 8192, 12288];
/** Projected images are drawn on one canvas, so they stay within what browsers handle comfortably. */
const PROJECTED_WIDTHS = [1024, 2048, 4096, 8192];

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
  // the tracing picture: shown in images per its own setting; left out of one project file on request
  const reference = useDoc((s) => s.doc.reference);
  const [projectReference, setProjectReference] = useState(true);
  const referenceBytes = reference ? (assetLibrary.referenceBlob(reference.assetId)?.size ?? 0) : 0;
  const referenceMb = referenceBytes ? `${(referenceBytes / 1e6).toFixed(referenceBytes < 1e7 ? 1 : 0)} MB` : '';
  // start from what's on screen: the projection being viewed, centred as it is
  const viewing = useEditor((s) => s.viewProjection);
  const [projection, setProjection] = useState<ProjectionParams>(viewing ?? { id: 'equirectangular', lon0: 0, lat0: 90, extent: 180 });
  const projected = !flat && projection.id !== 'equirectangular';
  const close = () => set({ dialog: null });
  const size = projected ? projectedSize(projection, Math.min(width, 8192)) : exportSize({ region, width });
  const pickProjection = (id: ProjectionId) =>
    setProjection((p) => ({
      ...p,
      id,
      // sensible starting centres: the north pole for polar maps, a tilted view for the globe
      lat0: id === 'azimuthal' ? 90 : id === 'orthographic' ? 25 : p.lat0,
    }));
  const mp = (size.width * size.height) / 1e6;
  const run = async (fn: () => Promise<void>, done: EventProps<'map_exported'>, offerShare = false) => {
    close();
    try {
      await fn();
      track('map_exported', done);
      if (offerShare && shouldOfferShare()) set({ dialog: 'share' });
    } catch (e) {
      notify('Export failed: ' + (e instanceof Error ? e.message : String(e)), 'error');
      track('operation_failed', { op: 'export' });
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
          {!flat && (
            <>
              <Select<ProjectionId> label="Projection" value={projection.id} options={PROJECTIONS.map((p) => ({ value: p.id, label: p.name }))} onChange={pickProjection} />
              <p className="hint">{PROJECTIONS.find((p) => p.id === projection.id)?.description}</p>
            </>
          )}
          {projected ? (
            <div className="projection-setup">
              <ProjectionPreview params={projection} fog={fog} peaks={peaks} onChange={(p) => setProjection((q) => ({ ...q, ...p }))} />
              <div className="projection-controls">
                <Slider
                  label={projection.id === 'orthographic' || projection.id === 'azimuthal' ? 'Centre longitude' : 'Central meridian'}
                  value={projection.lon0}
                  min={-180}
                  max={180}
                  step={1}
                  onChange={(v) => setProjection((p) => ({ ...p, lon0: v }))}
                  format={(v) => `${Math.abs(Math.round(v))}° ${v < 0 ? 'W' : 'E'}`}
                />
                {(projection.id === 'orthographic' || projection.id === 'azimuthal') && (
                  <Slider
                    label="Centre latitude"
                    value={projection.lat0}
                    min={-90}
                    max={90}
                    step={1}
                    onChange={(v) => setProjection((p) => ({ ...p, lat0: v }))}
                    format={(v) => (Math.round(v) === 90 ? 'North pole' : Math.round(v) === -90 ? 'South pole' : `${Math.abs(Math.round(v))}° ${v < 0 ? 'S' : 'N'}`)}
                  />
                )}
                {projection.id === 'azimuthal' && (
                  <>
                    <div className="btn-row">
                      <button className="btn small" onClick={() => setProjection((p) => ({ ...p, lat0: 90 }))}>
                        North pole
                      </button>
                      <button className="btn small" onClick={() => setProjection((p) => ({ ...p, lat0: -90 }))}>
                        South pole
                      </button>
                    </div>
                    <Segmented
                      label="Shows"
                      value={String(projection.extent)}
                      onChange={(v) => setProjection((p) => ({ ...p, extent: Number(v) }))}
                      options={[
                        { value: '90', label: 'One hemisphere' },
                        { value: '180', label: 'The whole planet' },
                      ]}
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            <Segmented
              label="Area"
              value={region}
              onChange={setRegion}
              options={[
                { value: 'view', label: 'Current view' },
                { value: 'world', label: flat ? 'Whole map' : 'Whole planet' },
              ]}
            />
          )}
          <Segmented
            label="Width"
            value={String(projected ? Math.min(width, 8192) : width)}
            onChange={(v) => setWidth(Number(v))}
            options={(projected ? PROJECTED_WIDTHS : WIDTHS).map((w) => ({ value: String(w), label: `${w}px` }))}
          />
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
          {reference && (
            <Toggle
              label="Include reference image"
              checked={reference.inExport}
              onChange={(v) => setReference({ inExport: v }, 'Reference in exports')}
              hint="The same setting as in Layers → Reference image"
            />
          )}
          <p className="hint">
            Output: {size.width.toLocaleString()} × {size.height.toLocaleString()} px ({mp.toFixed(1)} MP). Large images are rendered in tiles and may take a moment.
          </p>
          <div className="btn-row end">
            <button
              className="btn primary"
              disabled={mp > (projected ? 70 : 160)}
              onClick={() =>
                run(
                  () => (projected ? exportProjectedImage({ projection, width: Math.min(width, 8192), fog, includePeaks: peaks }) : exportImage({ region, width, fog, includePeaks: peaks })),
                  { format: 'image', projection: flat ? 'flat' : projection.id },
                  true,
                )
              }
            >
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
            <button className="btn primary" onClick={() => run(() => exportHeightmap(bits === '16' ? 16 : 8, hmWidth), { format: 'heightmap' })}>
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
          {reference && (
            <Toggle
              label={`Include reference image${referenceMb ? ` (${referenceMb})` : ''}`}
              checked={projectReference}
              onChange={setProjectReference}
              hint="Leave it out to make a smaller file; the map in this browser keeps its picture"
            />
          )}
          <div className="btn-row end">
            <button className="btn primary" onClick={() => run(() => exportProject({ includeReference: projectReference }), { format: 'project' })}>
              <FileArchive size={14} /> Export project
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
