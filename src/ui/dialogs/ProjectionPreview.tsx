import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { makeProjection, type ProjectionParams } from '../../core/projections';
import type { FogExport } from '../../editor/exporter';
import { drawProjected, projectedSize, renderProjectionSource, type ProjectionSource } from '../../editor/projectedExport';

const PREVIEW_W = 480;

/**
 * A small live picture of the export in its projection. Dragging it turns the
 * globe (or moves the centre of the map).
 */
export function ProjectionPreview({ params, fog, peaks, onChange }: { params: ProjectionParams; fog: FogExport; peaks: boolean; onChange: (p: Partial<ProjectionParams>) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the source belongs to one fog setting; a stale one is simply not shown
  const [loaded, setLoaded] = useState<{ fog: FogExport; src: ProjectionSource } | null>(null);
  const src = loaded?.fog === fog ? loaded.src : null;
  const drag = useRef<{ x: number; y: number; lon0: number; lat0: number } | null>(null);
  const token = useRef(0);

  // the planet on the editor's grid, rendered once at preview size
  useEffect(() => {
    let alive = true;
    void renderProjectionSource(1024, fog).then((s) => alive && setLoaded({ fog, src: s }));
    return () => {
      alive = false;
    };
  }, [fog]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return;
    const { width, height } = projectedSize(params, PREVIEW_W);
    const t = ++token.current;
    // draw off screen, then show it only if no newer drawing has started
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    void drawProjected(off, { projection: params, width, fog, includePeaks: peaks }, src).then(() => {
      if (t !== token.current) return;
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(off, 0, 0);
    });
  }, [src, params, fog, peaks]);

  const movable = params.id !== 'equirectangular';
  const onDown = (e: React.PointerEvent) => {
    if (!movable) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, lon0: params.lon0, lat0: params.lat0 };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const canvas = ref.current;
    if (!d || !canvas) return;
    const proj = makeProjection(params);
    // degrees of the sphere per screen pixel at the centre of the preview
    const deg = ((proj.x1 - proj.x0) / canvas.clientWidth / proj.k0) * (180 / Math.PI);
    const lon0 = ((((d.lon0 - (e.clientX - d.x) * deg + 180) % 360) + 360) % 360) - 180;
    const centred = params.id === 'orthographic' || params.id === 'azimuthal';
    onChange(centred ? { lon0, lat0: Math.max(-90, Math.min(90, d.lat0 + (e.clientY - d.y) * deg)) } : { lon0 });
  };
  const onUp = () => (drag.current = null);

  return (
    <div className={'projection-preview' + (movable ? ' movable' : '')}>
      <canvas ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Preview of the export" />
      {!src && (
        <span className="projection-preview-wait">
          <LoaderCircle size={16} className="spin" /> Preparing the preview…
        </span>
      )}
      {movable && src && <small>Drag to {params.id === 'orthographic' ? 'turn the globe' : 'move the centre'}.</small>}
    </div>
  );
}
