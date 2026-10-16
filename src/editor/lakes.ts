import type { Vec2 } from '../model/types';
import { useEditor } from '../store/editorStore';
import { clearLake, lakeInfo, relevelLake, type LakeInfo } from '../terrain/lakes';
import { t } from '../i18n';
import { pushTileChange } from '../tools/ToolController';
import { editor } from './Editor';
import { ensureGeography, freshGeography, regionAt } from './geography';

/*
 * The selected lake: its figures, its level and removing it. A lake has no id; it is the water
 * joined to a cell, so the selection is that cell.
 */

let cache: { key: string; info: LakeInfo | null } | null = null;

/** The selected lake and its figures, or null (worked out once per change of lakes). */
export function selectedLake(): LakeInfo | null {
  const { selectedLake: at, lakeRev } = useEditor.getState();
  const model = editor.model;
  if (!at || !model) return null;
  const key = `${at[0]},${at[1]},${lakeRev}`;
  if (cache?.key !== key) cache = { key, info: lakeInfo(model, at[0], at[1]) };
  return cache.info;
}

/**
 * Select the lake at a cell (null lets it go). It shows as its water body too (name, size,
 * shore) once the lands and seas are measured with it.
 */
export function selectLake(at: Vec2 | null) {
  const st = useEditor.getState();
  if (!at) {
    if (st.selectedLake) st.set({ selectedLake: null, inspect: null });
    return;
  }
  const g = freshGeography();
  const r = g ? regionAt(g, at[0] + 0.5, at[1] + 0.5) : null;
  const inspect = r && !r.land && r.level !== undefined ? { land: false, id: r.id, anchorX: at[0] + 0.5, anchorY: at[1] + 0.5 } : null;
  st.set({ selection: [], selectedLake: at, inspect, inspectorOpen: true });
  if (!inspect) void ensureGeography();
}

/** Select tool: a click on a lake selects it, or lets it go when it is the one selected. */
export function pickLake(cells: number[], at: Vec2) {
  const st = useEditor.getState();
  const model = editor.model;
  const cur = st.selectedLake;
  if (model && cur && cells.includes(cur[1] * model.W + cur[0])) st.deselect();
  else selectLake(at);
}

/** Set the selected lake's level (it cannot rise past where it would spill). */
export function setLakeLevel(level: number) {
  const model = editor.model;
  const info = selectedLake();
  if (!model || !info) return;
  const v = Math.max(info.floor + 0.1, Math.min(info.spill, level));
  if (v === info.level) return;
  const { change, cells } = relevelLake(model, info.cells, v);
  if (change) pushTileChange(change, t('Change a lake’s level'), model);
  // keep the selection on the water: the cell it was on may have dried out
  if (cells.length) {
    let deepest = cells[0];
    for (const k of cells) if (model.height.get(k % model.W, (k / model.W) | 0) < model.height.get(deepest % model.W, (deepest / model.W) | 0)) deepest = k;
    selectLake([deepest % model.W, (deepest / model.W) | 0]);
  } else selectLake(null);
}

/** Remove the selected lake's water (the ground stays as it is). */
export function deleteSelectedLake() {
  const model = editor.model;
  const info = selectedLake();
  if (!model || !info) return;
  const change = clearLake(model, info.cells);
  if (change) pushTileChange(change, t('Remove a lake'), model);
  selectLake(null);
}
