import { uid } from '../core/math';
import type {
  MapLabel,
  MapObject,
  ObjectLayer,
  PathFeature,
  PeakAnnotation,
  SelectionRef,
  Territory,
} from '../model/types';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import type { ResolvedPeak } from '../terrain/peaks';

const commit = (...a: Parameters<ReturnType<typeof useDoc.getState>['commit']>) => useDoc.getState().commit(...a);
const doc = () => useDoc.getState().doc;

// ---------------------------------------------------------------- objects

export function newObject(p: Partial<MapObject> & Pick<MapObject, 'assetId' | 'x' | 'y' | 'size'>): MapObject {
  const d = doc();
  const z = Object.values(d.objects).reduce((m, o) => Math.max(m, o.z), 0) + 1;
  const layer = p.layerId ?? useEditor.getState().activeObjectLayer;
  return {
    id: uid('obj-'),
    layerId: d.objectLayers.some((l) => l.id === layer) ? layer : d.objectLayers[0].id,
    scale: 1,
    rotation: 0,
    flipX: false,
    opacity: 1,
    z,
    locked: false,
    hidden: false,
    name: '',
    description: '',
    meta: {},
    ...p,
  };
}

export function addObjects(objs: MapObject[], label = 'Place object') {
  if (!objs.length) return;
  commit(label, (d) => {
    const objects = { ...d.objects };
    for (const o of objs) objects[o.id] = o;
    return { objects };
  });
}

export function updateObjects(ids: string[], patch: Partial<MapObject> | ((o: MapObject) => Partial<MapObject>), label = 'Edit object', mergeKey?: string) {
  commit(
    label,
    (d) => {
      const objects = { ...d.objects };
      for (const id of ids) {
        const o = objects[id];
        if (!o) continue;
        objects[id] = { ...o, ...(typeof patch === 'function' ? patch(o) : patch) };
      }
      return { objects };
    },
    mergeKey,
  );
}

// ---------------------------------------------------------------- generic per-kind edits

type KindMap = { path: PathFeature; territory: Territory; label: MapLabel };
const KEY = { path: 'paths', territory: 'territories', label: 'labels' } as const;

export function addFeature<K extends keyof KindMap>(kind: K, item: KindMap[K], label: string) {
  const key = KEY[kind];
  commit(label, (d) => ({ [key]: { ...d[key], [item.id]: item } }));
}

export function updateFeature<K extends keyof KindMap>(kind: K, id: string, patch: Partial<KindMap[K]>, label: string, mergeKey?: string) {
  const key = KEY[kind];
  commit(
    label,
    (d) => {
      const coll = d[key] as unknown as Record<string, KindMap[K]>;
      const cur = coll[id];
      if (!cur) return {};
      return { [key]: { ...coll, [id]: { ...cur, ...patch } } };
    },
    mergeKey,
  );
}

// ---------------------------------------------------------------- selection-wide

export function deleteRefs(refs: SelectionRef[]) {
  if (!refs.length) return;
  commit(refs.length > 1 ? `Delete ${refs.length} items` : 'Delete', (d) => {
    const objects = { ...d.objects };
    const paths = { ...d.paths };
    const territories = { ...d.territories };
    const labels = { ...d.labels };
    const peaks = { ...d.peaks };
    for (const r of refs) {
      if (r.kind === 'object' && !objects[r.id]?.locked) delete objects[r.id];
      if (r.kind === 'path' && !paths[r.id]?.locked) delete paths[r.id];
      if (r.kind === 'territory' && !territories[r.id]?.locked) delete territories[r.id];
      if (r.kind === 'label' && !labels[r.id]?.locked) delete labels[r.id];
    }
    return { objects, paths, territories, labels, peaks };
  });
  for (const r of refs) if (r.kind === 'peak') removePeak(r.id);
  useEditor.getState().select([]);
}

export function duplicateRefs(refs: SelectionRef[], offset: number) {
  const d = doc();
  const out: SelectionRef[] = [];
  const objects = { ...d.objects };
  const paths = { ...d.paths };
  const territories = { ...d.territories };
  const labels = { ...d.labels };
  let z = Object.values(d.objects).reduce((m, o) => Math.max(m, o.z), 0);
  for (const r of refs) {
    if (r.kind === 'object' && d.objects[r.id]) {
      const o = d.objects[r.id];
      const n = { ...o, id: uid('obj-'), x: o.x + offset, y: o.y + offset, z: ++z, locked: false, meta: { ...o.meta } };
      objects[n.id] = n;
      out.push({ kind: 'object', id: n.id });
    } else if (r.kind === 'path' && d.paths[r.id]) {
      const p = d.paths[r.id];
      const n = { ...p, id: uid('path-'), points: p.points.map(([x, y]) => [x + offset, y + offset] as [number, number]), locked: false };
      paths[n.id] = n;
      out.push({ kind: 'path', id: n.id });
    } else if (r.kind === 'territory' && d.territories[r.id]) {
      const t = d.territories[r.id];
      const n = {
        ...t,
        id: uid('terr-'),
        name: t.name + ' (copy)',
        points: t.points.map(([x, y]) => [x + offset, y + offset] as [number, number]),
        labelPos: t.labelPos ? ([t.labelPos[0] + offset, t.labelPos[1] + offset] as [number, number]) : null,
        locked: false,
      };
      territories[n.id] = n;
      out.push({ kind: 'territory', id: n.id });
    } else if (r.kind === 'label' && d.labels[r.id]) {
      const l = d.labels[r.id];
      const n = { ...l, id: uid('label-'), x: l.x + offset, y: l.y + offset, locked: false };
      labels[n.id] = n;
      out.push({ kind: 'label', id: n.id });
    }
  }
  if (!out.length) return;
  commit('Duplicate', () => ({ objects, paths, territories, labels }));
  useEditor.getState().select(out);
}

/** Move selected items by a world offset (from their state in `base`). */
export function moveRefs(refs: SelectionRef[], dx: number, dy: number, base = doc(), mergeKey?: string) {
  commit(
    'Move',
    (d) => {
      const objects = { ...d.objects };
      const paths = { ...d.paths };
      const territories = { ...d.territories };
      const labels = { ...d.labels };
      for (const r of refs) {
        if (r.kind === 'object' && base.objects[r.id] && !base.objects[r.id].locked) {
          const o = base.objects[r.id];
          objects[r.id] = { ...objects[r.id], x: o.x + dx, y: o.y + dy };
        } else if (r.kind === 'path' && base.paths[r.id] && !base.paths[r.id].locked) {
          paths[r.id] = { ...paths[r.id], points: base.paths[r.id].points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
        } else if (r.kind === 'territory' && base.territories[r.id] && !base.territories[r.id].locked) {
          const t = base.territories[r.id];
          territories[r.id] = {
            ...territories[r.id],
            points: t.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
            labelPos: t.labelPos ? [t.labelPos[0] + dx, t.labelPos[1] + dy] : null,
          };
        } else if (r.kind === 'label' && base.labels[r.id] && !base.labels[r.id].locked) {
          const l = base.labels[r.id];
          labels[r.id] = { ...labels[r.id], x: l.x + dx, y: l.y + dy };
        }
      }
      return { objects, paths, territories, labels };
    },
    mergeKey,
  );
}

export function reorderObjects(ids: string[], mode: 'front' | 'back' | 'forward' | 'backward') {
  const d = doc();
  const sorted = Object.values(d.objects).sort((a, b) => a.z - b.z);
  const sel = new Set(ids);
  let order = sorted.map((o) => o.id);
  if (mode === 'front') order = [...order.filter((i) => !sel.has(i)), ...order.filter((i) => sel.has(i))];
  else if (mode === 'back') order = [...order.filter((i) => sel.has(i)), ...order.filter((i) => !sel.has(i))];
  else if (mode === 'forward') {
    for (let i = order.length - 2; i >= 0; i--) if (sel.has(order[i]) && !sel.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]];
  } else {
    for (let i = 1; i < order.length; i++) if (sel.has(order[i]) && !sel.has(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]];
  }
  commit('Reorder', (dd) => {
    const objects = { ...dd.objects };
    order.forEach((id, i) => (objects[id] = { ...objects[id], z: i + 1 }));
    return { objects };
  });
}

// ---------------------------------------------------------------- object layers

export function addObjectLayer(name: string) {
  const layer: ObjectLayer = { id: uid('layer-'), name, visible: true, locked: false, opacity: 1 };
  commit('Add layer', (d) => ({ objectLayers: [...d.objectLayers, layer] }));
  useEditor.getState().set({ activeObjectLayer: layer.id });
  return layer.id;
}

export function updateObjectLayer(id: string, patch: Partial<ObjectLayer>, mergeKey?: string) {
  commit('Edit layer', (d) => ({ objectLayers: d.objectLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), mergeKey);
}

export function moveObjectLayer(id: string, dir: -1 | 1) {
  commit('Reorder layers', (d) => {
    const arr = d.objectLayers.slice();
    const i = arr.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return {};
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { objectLayers: arr };
  });
}

/** Delete a layer; its objects move to the first remaining layer. */
export function deleteObjectLayer(id: string) {
  const d = doc();
  if (d.objectLayers.length <= 1) return;
  const rest = d.objectLayers.filter((l) => l.id !== id);
  const target = rest[0].id;
  commit('Delete layer', (dd) => {
    const objects = { ...dd.objects };
    for (const o of Object.values(objects)) if (o.layerId === id) objects[o.id] = { ...o, layerId: target };
    return { objectLayers: rest, objects };
  });
  if (useEditor.getState().activeObjectLayer === id) useEditor.getState().set({ activeObjectLayer: target });
}

// ---------------------------------------------------------------- peaks

export function annotatePeak(peak: ResolvedPeak, patch: Partial<PeakAnnotation>) {
  if (peak.annotationId) {
    commit('Edit peak', (d) => ({ peaks: { ...d.peaks, [peak.annotationId!]: { ...d.peaks[peak.annotationId!], ...patch } } }), 'peak:' + peak.annotationId);
    return peak.annotationId;
  }
  const ann: PeakAnnotation = { id: uid('peak-'), x: peak.x, y: peak.y, name: '', mode: 'designated', ...patch };
  commit('Name peak', (d) => ({ peaks: { ...d.peaks, [ann.id]: ann } }));
  return ann.id;
}

export function designatePeak(x: number, y: number) {
  const ann: PeakAnnotation = { id: uid('peak-'), x, y, name: '', mode: 'designated' };
  commit('Designate peak', (d) => ({ peaks: { ...d.peaks, [ann.id]: ann } }));
  return ann.id;
}

/** Remove a peak from the map: drop its annotation, and suppress automatic detection there. */
export function removePeak(id: string) {
  const peak = useEditor.getState().peaks.find((p) => p.id === id);
  if (!peak) return;
  commit('Remove peak', (d) => {
    const peaks = { ...d.peaks };
    if (peak.annotationId) delete peaks[peak.annotationId];
    const sup: PeakAnnotation = { id: uid('peak-'), x: peak.x, y: peak.y, name: '', mode: 'suppressed' };
    peaks[sup.id] = sup;
    return { peaks };
  });
}

export function restoreSuppressedPeaks() {
  commit('Restore peaks', (d) => ({ peaks: Object.fromEntries(Object.entries(d.peaks).filter(([, p]) => p.mode !== 'suppressed')) }));
}
