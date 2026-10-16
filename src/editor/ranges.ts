import { track } from '../analytics';
import { clamp, uid } from '../core/math';
import { t } from '../i18n';
import { history } from '../model/history';
import type { MountainRange, Vec2 } from '../model/types';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import type { TileChange } from '../terrain/TerrainModel';
import { bakeRanges, crestCurve, nearestOnCurve, rebuildRanges } from '../terrain/ranges';
import { editor } from './Editor';

/*
 * Editing mountain ranges drawn as crest lines (the Mountain range tool's lines
 * mode, alpha). Every change carves the ranges again and is one undo step.
 */

const setRanges = (ranges: Record<string, MountainRange>) => useDoc.setState((s) => ({ doc: { ...s.doc, ranges }, revision: s.revision + 1 }));

let carving = false;

/** Whether ranges are being carved (new changes wait until it is done). */
export const isCarving = () => carving;

function pushChange(label: string, before: Record<string, MountainRange>, after: Record<string, MountainRange>, changes: TileChange[]) {
  const model = editor.model!;
  let bytes = 4096;
  for (const c of changes) for (const v of [...c.before.values(), ...c.after.values()]) bytes += v?.byteLength ?? 0;
  history.push({
    label,
    cost: bytes,
    undo: () => {
      for (const c of changes.slice().reverse()) model.applyTiles(c, 'before');
      setRanges(before);
    },
    redo: () => {
      for (const c of changes) model.applyTiles(c, 'after');
      setRanges(after);
    },
  });
  track('first_edit');
}

/** Change the ranges and carve the ones affected, as one undo step. */
async function changeRanges(label: string, after: Record<string, MountainRange>, changed: string[], removed: MountainRange[] = []) {
  const model = editor.model;
  if (!model || carving) return;
  const before = useDoc.getState().doc.ranges;
  setRanges(after);
  carving = true;
  useEditor.getState().set({ busy: t('Rivers are carving the mountains…'), busyCancel: null });
  try {
    const changes = await rebuildRanges(model, after, changed, removed);
    pushChange(label, before, after, changes);
  } catch (e) {
    console.error(e);
    setRanges(before);
  } finally {
    carving = false;
    useEditor.getState().set({ busy: null });
  }
}

/** The crest line nearest to p, within `maxDist` cells. */
export function snapToCrest(p: Vec2, maxDist: number): { range: string; line: string; t: number; at: Vec2 } | null {
  let best: { range: string; line: string; t: number; at: Vec2; d: number } | null = null;
  for (const r of Object.values(useDoc.getState().doc.ranges))
    for (const l of r.lines) {
      const c = crestCurve(l.points);
      if (c.length < 2) continue;
      const n = nearestOnCurve(c, p);
      if (n.d <= maxDist && (!best || n.d < best.d)) best = { range: r.id, line: l.id, t: n.t, at: n.at, d: n.d };
    }
  return best;
}

/** A new range's settings: a belt a few dozen cells wide, within sensible widths on the ground. */
function newRange(points: Vec2[]): MountainRange {
  const model = editor.model!;
  const n = Object.keys(useDoc.getState().doc.ranges).length;
  return {
    id: uid('range-'),
    name: t('Mountain range {n}', { n: n + 1 }),
    lines: [{ id: uid('crest-'), points }],
    heightM: 3500,
    widthKm: Math.round(clamp(60 * model.geo.kmPerCellY, 30, 300)),
    irregularity: 0.6,
    asymmetry: 0.3,
    seed: Math.floor(Math.random() * 1e9),
    locked: false,
  };
}

/**
 * Add a drawn crest line. A line that starts (or ends) on another range's crest branches off
 * it; otherwise it starts a new range. `snap` is the snapping distance, cells.
 */
export function addCrestLine(raw: Vec2[], snap: number) {
  if (raw.length < 2 || carving) return;
  let pts = raw.slice();
  let at = snapToCrest(pts[0], snap);
  if (!at) {
    const end = snapToCrest(pts[pts.length - 1], snap);
    // drawn towards the range: it still grows out of it
    if (end) {
      pts = pts.reverse();
      at = end;
    }
  }
  const ranges = useDoc.getState().doc.ranges;
  if (at) {
    // a branch is a range of its own, joined to the crest it grows from; it starts out like
    // that range and can then be made lower, narrower or of another nature
    pts[0] = at.at;
    const parent = ranges[at.range];
    const r: MountainRange = {
      ...newRange(pts),
      heightM: parent.heightM,
      widthKm: parent.widthKm,
      irregularity: parent.irregularity,
      asymmetry: parent.asymmetry,
    };
    r.lines[0].from = { range: parent.id, line: at.line, t: at.t };
    useEditor.getState().set({ activeRange: r.id });
    void changeRanges(t('Branch a mountain range'), { ...ranges, [r.id]: r }, [r.id]);
    return;
  }
  const r = newRange(pts);
  useEditor.getState().set({ activeRange: r.id });
  void changeRanges(t('Draw a mountain range'), { ...ranges, [r.id]: r }, [r.id]);
}

/** Change a range's settings and carve it again. */
export function updateRange(id: string, patch: Partial<MountainRange>) {
  const ranges = useDoc.getState().doc.ranges;
  const r = ranges[id];
  if (!r) return;
  void changeRanges(t('Reshape a mountain range'), { ...ranges, [id]: { ...r, ...patch } }, [id]);
}

/** Remove a range and its relief (the land under it stays). */
export function deleteRange(id: string) {
  const ranges = useDoc.getState().doc.ranges;
  const r = ranges[id];
  if (!r) return;
  const after = { ...ranges };
  delete after[id];
  if (useEditor.getState().activeRange === id) useEditor.getState().set({ activeRange: null });
  void changeRanges(t('Delete a mountain range'), after, [], [r]);
}

/**
 * Keep a range's mountains as they are, as plain terrain to sculpt with the brushes: the range
 * (and the ranges carved together with it) stop being lines.
 */
export function bakeRange(id: string) {
  const model = editor.model;
  const ranges = useDoc.getState().doc.ranges;
  if (!model || !ranges[id] || carving) return;
  const { after, changes } = bakeRanges(model, ranges, id);
  setRanges(after);
  useEditor.getState().set({ activeRange: null });
  pushChange(t('Bake mountains into the terrain'), ranges, after, changes);
}
