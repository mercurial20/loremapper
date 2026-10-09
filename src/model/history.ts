export interface HistoryEntry {
  label: string;
  undo(): void;
  redo(): void;
  /** Rough memory cost in bytes, used to bound the stack. */
  cost?: number;
  /** Entries with the same merge key, committed close together, coalesce. */
  mergeKey?: string;
  time?: number;
  /** Fold a newer entry into this one (when merge keys match). */
  merge?(next: HistoryEntry): void;
}

type Listener = () => void;

const MAX_ENTRIES = 120;
const MAX_COST = 400 * 1024 * 1024;
const MERGE_WINDOW_MS = 1200;

/** Linear undo/redo stack shared by raster and vector edits. */
export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get undoLabel() {
    return this.undoStack.at(-1)?.label ?? '';
  }
  get redoLabel() {
    return this.redoStack.at(-1)?.label ?? '';
  }

  push(entry: HistoryEntry) {
    entry.time = performance.now();
    const top = this.undoStack.at(-1);
    if (
      top &&
      entry.mergeKey &&
      top.mergeKey === entry.mergeKey &&
      top.merge &&
      entry.time - (top.time ?? 0) < MERGE_WINDOW_MS
    ) {
      top.merge(entry);
      top.time = entry.time;
    } else {
      this.undoStack.push(entry);
    }
    this.redoStack = [];
    this.trim();
    this.emit();
  }

  private trim() {
    let cost = this.undoStack.reduce((s, e) => s + (e.cost ?? 0), 0);
    while (this.undoStack.length > MAX_ENTRIES || (cost > MAX_COST && this.undoStack.length > 1)) {
      const e = this.undoStack.shift()!;
      cost -= e.cost ?? 0;
    }
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return;
    e.undo();
    this.redoStack.push(e);
    this.emit();
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return;
    e.redo();
    this.undoStack.push(e);
    this.emit();
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }
}

export const history = new History();
