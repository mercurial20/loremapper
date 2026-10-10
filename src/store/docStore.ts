import { create } from 'zustand';
import { history } from '../model/history';
import { useEditor } from './editorStore';
import {
  emptyDocument,
  type MapDocument,
  type ProjectMeta,
  type SystemLayerId,
  type SystemLayerState,
  type ViewSettings,
} from '../model/types';

/** Content = the undoable part of a document. View and layer visibility are not undoable. */
type Content = Omit<MapDocument, 'view' | 'systemLayers'>;

interface DocState {
  meta: ProjectMeta | null;
  doc: MapDocument;
  /** Increments on every document change (used by autosave). */
  revision: number;
  load(meta: ProjectMeta, doc: MapDocument): void;
  setMeta(patch: Partial<ProjectMeta>): void;
  /** Undoable content edit. */
  commit(label: string, fn: (doc: MapDocument) => Partial<Content>, mergeKey?: string): void;
  /** Non-undoable view settings. */
  setView(patch: Partial<ViewSettings>): void;
  setSystemLayer(id: SystemLayerId, patch: Partial<SystemLayerState>): void;
}

function content(doc: MapDocument): Content {
  const { view: _v, systemLayers: _s, ...rest } = doc;
  return rest;
}

export const useDoc = create<DocState>((set, get) => ({
  meta: null,
  doc: emptyDocument(),
  revision: 0,

  load(meta, doc) {
    set({ meta, doc, revision: get().revision + 1 });
  },

  setMeta(patch) {
    const meta = get().meta;
    if (!meta || useEditor.getState().readOnly) return;
    set({ meta: { ...meta, ...patch }, revision: get().revision + 1 });
  },

  commit(label, fn, mergeKey) {
    // the read-only viewer never changes map content
    if (useEditor.getState().readOnly) return;
    const before = content(get().doc);
    const patch = fn(get().doc);
    const doc = { ...get().doc, ...patch };
    set({ doc, revision: get().revision + 1 });
    let after = content(doc);
    const apply = (c: Content) => set((s) => ({ doc: { ...s.doc, ...c }, revision: s.revision + 1 }));
    history.push({
      label,
      mergeKey,
      cost: 2048,
      undo: () => apply(before),
      redo: () => apply(after),
      merge(next) {
        // keep our `before`, adopt the newer `after`
        after = content(get().doc);
        void next;
      },
    });
  },

  setView(patch) {
    set((s) => ({ doc: { ...s.doc, view: { ...s.doc.view, ...patch } }, revision: s.revision + 1 }));
  },

  setSystemLayer(id, patch) {
    set((s) => ({
      doc: { ...s.doc, systemLayers: { ...s.doc.systemLayers, [id]: { ...s.doc.systemLayers[id], ...patch } } },
      revision: s.revision + 1,
    }));
  },
}));
