import {
  Check,
  ChevronDown,
  CircleAlert,
  CloudFog,
  Download,
  Eye,
  EyeOff,
  Globe,
  Keyboard,
  LoaderCircle,
  MessageSquarePlus,
  Redo2,
  SlidersHorizontal,
  Undo2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { history } from '../model/history';
import type { StylePresetId } from '../model/types';
import { STYLE_PRESETS } from '../render/styles';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { UnitsSwitch } from './UnitsSwitch';
import { formatHeight } from '../core/units';
import { COMMUNITY_LINKS } from '../community';
import { editor } from '../editor/Editor';
import { Segmented, Slider } from './controls/controls';
import { APP_VERSION } from '../version';
import { CompassRose, GitHubMark, RedditMark } from './icons';

function Popover({ button, children, align = 'left' }: { button: (open: boolean, toggle: () => void) => ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open]);
  return (
    <div className="popover-anchor" ref={ref}>
      {button(open, () => setOpen(!open))}
      {open && <div className={'popover ' + align}>{children}</div>}
    </div>
  );
}

function SaveIndicator() {
  const status = useEditor((s) => s.saveStatus);
  if (status === 'saving' || status === 'pending')
    return (
      <span className="save-ind saving" title="Your work is saved automatically to this browser">
        <LoaderCircle size={14} className="spin" /> Saving…
      </span>
    );
  if (status === 'error')
    return (
      <span className="save-ind error" title="Saving failed — export your project as a backup">
        <CircleAlert size={14} /> Not saved
      </span>
    );
  return (
    <span className="save-ind" title="Saved locally in this browser (IndexedDB)">
      <Check size={14} /> Saved
    </span>
  );
}

/** A tiny island drawn in a style's own colours. */
function StyleThumb({ s }: { s: (typeof STYLE_PRESETS)[StylePresetId] }) {
  const land = (t: number) => s.land.reduce((c, [at, col]) => (at <= t ? col : c), s.land[0][1]);
  const water = (t: number) => s.water.reduce((c, [at, col]) => (at <= t ? col : c), s.water[0][1]);
  return (
    <svg className="style-thumb" viewBox="0 0 64 36" aria-hidden>
      <rect width="64" height="36" fill={water(0.6)} />
      <path d="M8 26 C10 14 22 8 34 9 C46 10 58 16 56 25 C54 32 40 33 30 31 C20 30 7 34 8 26 Z" fill={water(0.05)} />
      <path d="M12 25 C14 16 23 12 33 12 C44 12 53 17 52 24 C51 29 40 30 31 28 C22 27 11 31 12 25 Z" fill={land(0.01)} stroke={s.coastInk} strokeWidth={Math.min(1.6, s.coastWidth * 0.55)} />
      <path d="M17 24 C20 19 26 17 30 19 C33 21 28 25 22 26 Z" fill={s.biomes[1]} />
      <path d="M30 22 L37 13 L42 19 L46 15 L50 23 Z" fill={land(0.5)} />
      <path d="M35 15.5 L37 13 L39 15.5 Z M44.6 16.6 L46 15 L47.3 16.8 Z" fill={land(1)} />
    </svg>
  );
}

function ViewMenu() {
  const view = useDoc((s) => s.doc.view);
  const setView = useDoc((s) => s.setView);
  const units = useEditor((s) => s.units);
  useDoc((s) => s.meta);
  const flat = !!editor.model?.geo.flat;
  const current = STYLE_PRESETS[view.style] ?? STYLE_PRESETS.parchment;
  const chip = (label: string, on: boolean, toggle: () => void, title?: string) => (
    <button className={'view-chip' + (on ? ' on' : '')} onClick={toggle} aria-pressed={on} title={title}>
      {on && <Check size={12} />} {label}
    </button>
  );
  return (
    <div className="view-menu">
      <h4>Map style</h4>
      <div className="style-tiles">
        {(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((id) => {
          const s = STYLE_PRESETS[id];
          return (
            <button key={id} className={'style-tile' + (view.style === id ? ' on' : '')} onClick={() => setView({ style: id })} title={s.description} aria-pressed={view.style === id}>
              <StyleThumb s={s} />
              <span>{s.name}</span>
            </button>
          );
        })}
      </div>
      <p className="style-desc">{current.description}</p>
      <h4>Relief</h4>
      <Slider label="Hill shading" value={view.hillshade} min={0} max={2} step={0.05} onChange={(v) => setView({ hillshade: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <h4>Show on map</h4>
      <div className="view-chips">
        {chip('Contours', view.contours, () => setView({ contours: !view.contours }), 'Contour lines')}
        {chip('Height colours', view.heightOverlay, () => setView({ heightOverlay: !view.heightOverlay }), 'Hypsometric tints by elevation')}
        {chip('Peaks', view.showPeaks, () => setView({ showPeaks: !view.showPeaks }), 'Peak markers with their heights')}
        {chip('Coastal ripples', view.coastRipples, () => setView({ coastRipples: !view.coastRipples }))}
        {chip(flat ? 'Distance grid' : 'Lat / long grid', view.graticule, () => setView({ graticule: !view.graticule }))}
        {!flat && chip('Repeat sideways', view.repeat !== false, () => setView({ repeat: view.repeat === false }), 'Only changes how the planet is shown: it stays round and continuous')}
      </div>
      {view.contours && (
        <Segmented
          label="Contour interval"
          value={String(view.contourInterval)}
          options={['100', '250', '500', '1000', '2000'].map((v) => ({
            value: v,
            label: units === 'imperial' ? formatHeight(Number(v), units) : `${Number(v) >= 1000 ? Number(v) / 1000 + 'k' : v}`,
          }))}
          onChange={(v) => setView({ contourInterval: Number(v) })}
        />
      )}
      {view.showPeaks && (
        <Slider label="Show peaks above" value={view.peakMinElevation} min={300} max={9000} step={100} onChange={(v) => setView({ peakMinElevation: v })} format={(v) => formatHeight(v, units)} />
      )}
    </div>
  );
}

export function TopBar() {
  const meta = useDoc((s) => s.meta);
  const setMeta = useDoc((s) => s.setMeta);
  const { canUndo, canRedo, undoLabel, redoLabel, fogPreview, set } = useEditor();
  const view = useDoc((s) => s.doc.view);
  const setView = useDoc((s) => s.setView);
  const readOnly = useEditor((s) => s.readOnly);
  return (
    <header className={'topbar' + (readOnly ? ' viewer' : '')}>
      <div className="brand">
        <CompassRose size={26} />
        <span>Loremapper</span>
        <em className="beta" title={`Version ${APP_VERSION}`}>beta</em>
      </div>
      <div className="project-name">
        <input
          key={`${meta?.id}:${meta?.name}`}
          defaultValue={meta?.name ?? ''}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== meta?.name) setMeta({ name: v });
            else e.target.value = meta?.name ?? '';
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Map name"
          spellCheck={false}
          readOnly={readOnly}
        />
        <button className="btn ghost" onClick={() => set({ dialog: 'projects' })} title="All maps">
          Maps <ChevronDown size={14} />
        </button>
      </div>
      {!readOnly && (
        <div className="tb-group">
          <button className="icon-btn" disabled={!canUndo} onClick={() => history.undo()} title={canUndo ? `Undo ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}>
            <Undo2 size={18} />
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={() => history.redo()} title={canRedo ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}>
            <Redo2 size={18} />
          </button>
        </div>
      )}
      <div className="tb-group">
        {!readOnly && (
          <button className="btn" onClick={() => set({ dialog: 'generate' })}>
            <WandSparkles size={16} /> Generate
          </button>
        )}
        <Popover
          button={(open, toggle) => (
            <button className={'btn' + (open ? ' on' : '')} onClick={toggle}>
              <SlidersHorizontal size={16} /> View <ChevronDown size={14} />
            </button>
          )}
        >
          <ViewMenu />
        </Popover>
        <button className={'chip' + (view.contours ? ' on' : '')} onClick={() => setView({ contours: !view.contours })} title="Contour lines">
          Contours
        </button>
        <button className={'chip' + (view.heightOverlay ? ' on' : '')} onClick={() => setView({ heightOverlay: !view.heightOverlay })} title="Height overlay">
          Height
        </button>
        <button className={'chip' + (fogPreview ? ' on' : '')} onClick={() => set({ fogPreview: !fogPreview })} title="Show content hidden by fog (editor only)">
          {fogPreview ? <Eye size={14} /> : <EyeOff size={14} />} <CloudFog size={14} /> {fogPreview ? 'See through fog' : 'Player view'}
        </button>
      </div>
      <div className="spacer" />
      {!readOnly && <SaveIndicator />}
      <UnitsSwitch />
      <nav className="community-links" aria-label="Community">
        <a href={COMMUNITY_LINKS.github.href} target="_blank" rel="noopener noreferrer" title={COMMUNITY_LINKS.github.title}>
          <GitHubMark /> <span>{COMMUNITY_LINKS.github.label}</span>
        </a>
        <a className="reddit" href={COMMUNITY_LINKS.reddit.href} target="_blank" rel="noopener noreferrer" title={COMMUNITY_LINKS.reddit.title}>
          <RedditMark /> <span>{COMMUNITY_LINKS.reddit.label}</span>
        </a>
        <a href={COMMUNITY_LINKS.feedback.href} target="_blank" rel="noopener noreferrer" title={COMMUNITY_LINKS.feedback.title} aria-label={COMMUNITY_LINKS.feedback.title}>
          <MessageSquarePlus size={16} />
        </a>
      </nav>
      {!readOnly && (
        <>
          <button className="icon-btn" onClick={() => set({ dialog: 'planet' })} title="Map settings">
            <Globe size={18} />
          </button>
          <button className="icon-btn" onClick={() => set({ dialog: 'shortcuts' })} title="Keyboard shortcuts (?)">
            <Keyboard size={18} />
          </button>
          <button className="btn primary" onClick={() => set({ dialog: 'export' })}>
            <Download size={16} /> Export
          </button>
        </>
      )}
    </header>
  );
}
