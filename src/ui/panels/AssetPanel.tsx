import { Ellipsis, FolderPlus, ImagePlus, Pencil, RotateCcw, Search, Trash2, Upload, X, Eye } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPTED_TYPES, assetLibrary, useAssets, type AssetInfo } from '../../assets/library';
import { STARTER_CATEGORIES } from '../../assets/starter';
import { useEditor } from '../../store/editorStore';
import { useTranslation } from 'react-i18next';

export const ASSET_DRAG_TYPE = 'application/x-fantasy-asset';

function AssetTile({ a, selected, categories }: { a: AssetInfo; selected: boolean; categories: string[] }) {
  const { t } = useTranslation();
  // menu anchor in viewport coordinates; the menu is fixed-positioned so the
  // scrolling panel can't clip it
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const menu = menuAt !== null;
  const setMenu = (open: boolean) => setMenuAt(open ? menuAt : null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuAt) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAt(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAt(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menuAt]);
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
      title={t('{name} — click to place, or drag onto the map', { name: t(a.name) })}
    >
      <div className="thumb">
        <img src={a.url} alt="" loading="lazy" draggable={false} />
        {a.source === 'user' && <span className="badge">{t('mine')}</span>}
        {a.replaced && <span className="badge">{t('custom art')}</span>}
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
        <span className="tile-name">{t(a.name)}</span>
      )}
      <button
        className="tile-menu-btn"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (menu) return setMenuAt(null);
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenuAt({ x: Math.max(8, Math.min(r.left - 4, window.innerWidth - 188)), y: r.bottom + 4 });
        }}
        aria-label={t('Asset options')}
      >
        <Ellipsis size={14} />
      </button>
      {menu && (
        <div className="tile-menu" ref={menuRef} style={{ left: menuAt!.x, top: menuAt!.y }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setRenaming(true);
              setMenu(false);
            }}
          >
            <Pencil size={13} /> {t('Rename')}
          </button>
          <label className="menu-select">
            {t('Category')}
            <select
              value={a.category}
              onChange={(e) => {
                void assetLibrary.setCategory(a.id, e.target.value);
                setMenu(false);
              }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => fileRef.current?.click()}>
            <ImagePlus size={13} /> {t('Replace image…')}
          </button>
          {a.source === 'builtin' && (
            <button
              onClick={() => {
                void assetLibrary.resetBuiltin(a.id);
                setMenu(false);
              }}
            >
              <RotateCcw size={13} /> {t('Restore original')}
            </button>
          )}
          {a.hidden ? (
            <button
              onClick={() => {
                void assetLibrary.unhide(a.id);
                setMenu(false);
              }}
            >
              <Eye size={13} /> {t('Show in library')}
            </button>
          ) : (
            <button
              className="danger"
              onClick={() => {
                const msg =
                  a.source === 'builtin'
                    ? t('Hide “{name}” from the library? Objects already on maps stay.', { name: t(a.name) })
                    : t('Delete “{name}” from your library? Objects already placed keep a placeholder until you swap their artwork.', { name: t(a.name) });
                if (confirm(msg)) void assetLibrary.remove(a.id);
                setMenu(false);
              }}
            >
              <Trash2 size={13} /> {a.source === 'builtin' ? t('Hide') : t('Delete')}
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
                  .then(() => notify(t('Replaced artwork for “{name}”', { name: t(a.name) })))
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
  const { t } = useTranslation();
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
        (!s || a.name.toLowerCase().includes(s) || t(a.name).toLowerCase().includes(s) || t(a.category).toLowerCase().includes(s) || a.tags.some((tag) => tag.includes(s))),
    );
  }, [assets, q, cat, showHidden, t]);

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
        <h2>{t('Asset library')}</h2>
        <button className="icon-btn small" onClick={() => set({ assetPanelOpen: false })} aria-label={t('Close library')}>
          <X size={16} />
        </button>
      </header>
      <div className="asset-search">
        <Search size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search castles, dragons, gold…')} />
        {q && (
          <button className="icon-btn small" onClick={() => setQ('')}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="cat-chips">
        {['All', ...categories].map((c) => (
          <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
            {c === 'All' ? t('All') : t(c)}
          </button>
        ))}
        {newCat === null ? (
          <button className="chip ghost" onClick={() => setNewCat('')} title={t('New category')}>
            <FolderPlus size={13} />
          </button>
        ) : (
          <input
            className="chip-input"
            autoFocus
            placeholder={t('Category name')}
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
              const n = prompt(t('Rename category'), cat);
              if (n && n.trim()) {
                void assetLibrary.renameCategory(cat, n);
                setCat(n.trim());
              }
            }}
          >
            <Pencil size={12} /> {t('Rename')}
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm(t('Delete category “{name}”? Its assets move back to their default category.', { name: cat }))) {
                void assetLibrary.deleteCategory(cat);
                setCat('All');
              }
            }}
          >
            <Trash2 size={12} /> {t('Delete category')}
          </button>
        </div>
      )}
      <div className="asset-scroll">
        {grouped.map(([c, list]) => (
          <div key={c} className="asset-group">
            {cat === 'All' && <h4>{t(c)}</h4>}
            <div className="asset-grid">
              {list.map((a) => (
                <AssetTile key={a.id} a={a} selected={a.id === assetId} categories={categories} />
              ))}
            </div>
          </div>
        ))}
        {!filtered.length && <p className="empty">{t('No assets match.')}</p>}
      </div>
      <footer className="asset-foot">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> {t('Import PNG / WebP / SVG')}
        </button>
        <label className="mini-toggle">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> {t('Show hidden')}
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
        <small>{t('Imports are stored permanently in this browser. Drop files here to import into “{category}”.', { category: cat === 'All' ? t('Custom') : t(cat) })}</small>
      </footer>
    </aside>
  );
}
