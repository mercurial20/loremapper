import { Ellipsis, FolderPlus, ImagePlus, Pencil, RotateCcw, Search, Trash2, Upload, X, Eye } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { ACCEPTED_TYPES, assetLibrary, useAssets, type AssetInfo } from '../../assets/library';
import { STARTER_CATEGORIES } from '../../assets/starter';
import { useEditor } from '../../store/editorStore';

export const ASSET_DRAG_TYPE = 'application/x-fantasy-asset';

function AssetTile({ a, selected, categories }: { a: AssetInfo; selected: boolean; categories: string[] }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const notify = useEditor((s) => s.notify);
  const choose = () => {
    useEditor.getState().set({ assetId: a.id });
    useEditor.getState().setTool('object');
  };
  return (
    <div
      className={'asset-tile' + (selected ? ' on' : '') + (a.hidden ? ' hidden' : '')}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG_TYPE, a.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={choose}
      title={`${a.name} — click to place, or drag onto the map`}
    >
      <div className="thumb">
        <img src={a.url} alt="" loading="lazy" draggable={false} />
        {a.source === 'user' && <span className="badge">mine</span>}
        {a.replaced && <span className="badge">custom art</span>}
      </div>
      {renaming ? (
        <input
          className="tile-rename"
          autoFocus
          defaultValue={a.name}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            void assetLibrary.rename(a.id, e.target.value);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <span className="tile-name">{a.name}</span>
      )}
      <button
        className="tile-menu-btn"
        onClick={(e) => {
          e.stopPropagation();
          setMenu(!menu);
        }}
        aria-label="Asset options"
      >
        <Ellipsis size={14} />
      </button>
      {menu && (
        <div className="tile-menu" onClick={(e) => e.stopPropagation()} onMouseLeave={() => setMenu(false)}>
          <button
            onClick={() => {
              setRenaming(true);
              setMenu(false);
            }}
          >
            <Pencil size={13} /> Rename
          </button>
          <label className="menu-select">
            Category
            <select
              value={a.category}
              onChange={(e) => {
                void assetLibrary.setCategory(a.id, e.target.value);
                setMenu(false);
              }}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button onClick={() => fileRef.current?.click()}>
            <ImagePlus size={13} /> Replace image…
          </button>
          {a.source === 'builtin' && (
            <button
              onClick={() => {
                void assetLibrary.resetBuiltin(a.id);
                setMenu(false);
              }}
            >
              <RotateCcw size={13} /> Restore original
            </button>
          )}
          {a.hidden ? (
            <button
              onClick={() => {
                void assetLibrary.unhide(a.id);
                setMenu(false);
              }}
            >
              <Eye size={13} /> Show in library
            </button>
          ) : (
            <button
              className="danger"
              onClick={() => {
                const msg =
                  a.source === 'builtin'
                    ? `Hide “${a.name}” from the library? Objects already on maps stay.`
                    : `Delete “${a.name}” from your library? Objects already placed keep a placeholder until you swap their artwork.`;
                if (confirm(msg)) void assetLibrary.remove(a.id);
                setMenu(false);
              }}
            >
              <Trash2 size={13} /> {a.source === 'builtin' ? 'Hide' : 'Delete'}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept={ACCEPTED_TYPES.join(',') + ',.svg,.png,.webp'}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                assetLibrary
                  .replaceImage(a.id, f)
                  .then(() => notify(`Replaced artwork for “${a.name}”`))
                  .catch((err) => notify(String(err.message ?? err), 'error'));
              setMenu(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function AssetPanel() {
  const { assets, categories } = useAssets();
  const assetId = useEditor((s) => s.assetId);
  const set = useEditor((s) => s.set);
  const notify = useEditor((s) => s.notify);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [showHidden, setShowHidden] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [newCat, setNewCat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return assets.filter(
      (a) =>
        (showHidden || !a.hidden) &&
        (cat === 'All' || a.category === cat) &&
        (!s || a.name.toLowerCase().includes(s) || a.category.toLowerCase().includes(s) || a.tags.some((t) => t.includes(s))),
    );
  }, [assets, q, cat, showHidden]);

  const grouped = useMemo(() => {
    const m = new Map<string, AssetInfo[]>();
    for (const a of filtered) {
      if (!m.has(a.category)) m.set(a.category, []);
      m.get(a.category)!.push(a);
    }
    return [...m.entries()].sort((a, b) => categories.indexOf(a[0]) - categories.indexOf(b[0]));
  }, [filtered, categories]);

  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    const target = cat === 'All' ? 'Custom' : cat;
    try {
      const ids = await assetLibrary.importFiles(files, target);
      notify(`Added ${ids.length} asset${ids.length > 1 ? 's' : ''} to “${target}”`);
      if (ids[0]) set({ assetId: ids[0] });
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const custom = categories.filter((c) => !STARTER_CATEGORIES.includes(c));

  return (
    <aside
      className={'asset-panel' + (dragOver ? ' drag-over' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        void importFiles([...e.dataTransfer.files]);
      }}
    >
      <header className="panel-head">
        <h2>Asset library</h2>
        <button className="icon-btn small" onClick={() => set({ assetPanelOpen: false })} aria-label="Close library">
          <X size={16} />
        </button>
      </header>
      <div className="asset-search">
        <Search size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search castles, dragons, gold…" />
        {q && (
          <button className="icon-btn small" onClick={() => setQ('')}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="cat-chips">
        {['All', ...categories].map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
        {newCat === null ? (
          <button className="chip ghost" onClick={() => setNewCat('')} title="New category">
            <FolderPlus size={13} />
          </button>
        ) : (
          <input
            className="chip-input"
            autoFocus
            placeholder="Category name"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onBlur={() => {
              if (newCat.trim()) {
                void assetLibrary.addCategory(newCat);
                setCat(newCat.trim());
              }
              setNewCat(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setNewCat(null);
            }}
          />
        )}
      </div>
      {cat !== 'All' && custom.includes(cat) && (
        <div className="cat-tools">
          <button
            className="btn small"
            onClick={() => {
              const n = prompt('Rename category', cat);
              if (n && n.trim()) {
                void assetLibrary.renameCategory(cat, n);
                setCat(n.trim());
              }
            }}
          >
            <Pencil size={12} /> Rename
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm(`Delete category “${cat}”? Its assets move back to their default category.`)) {
                void assetLibrary.deleteCategory(cat);
                setCat('All');
              }
            }}
          >
            <Trash2 size={12} /> Delete category
          </button>
        </div>
      )}
      <div className="asset-scroll">
        {grouped.map(([c, list]) => (
          <div key={c} className="asset-group">
            {cat === 'All' && <h4>{c}</h4>}
            <div className="asset-grid">
              {list.map((a) => (
                <AssetTile key={a.id} a={a} selected={a.id === assetId} categories={categories} />
              ))}
            </div>
          </div>
        ))}
        {!filtered.length && <p className="empty">No assets match.</p>}
      </div>
      <footer className="asset-foot">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Import PNG / WebP / SVG
        </button>
        <label className="mini-toggle">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden
        </label>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept={ACCEPTED_TYPES.join(',') + ',.svg,.png,.webp'}
          onChange={(e) => {
            void importFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <small>Imports are stored permanently in this browser. Drop files here to import into “{cat === 'All' ? 'Custom' : cat}”.</small>
      </footer>
    </aside>
  );
}
