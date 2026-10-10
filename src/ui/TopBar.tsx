import {
  Check,
  ChevronDown,
  CircleAlert,
  CloudFog,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Keyboard,
  LoaderCircle,
  Redo2,
  SlidersHorizontal,
  Undo2,
  Users,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { history } from '../model/history';
import type { StylePresetId } from '../model/types';
import { STYLE_PRESETS } from '../render/styles';
import { useDoc } from '../store/docStore';
import { setUnits, useEditor } from '../store/editorStore';
import { formatHeight } from '../core/units';
import { COMMUNITY_LINKS } from '../community';
import { editor } from '../editor/Editor';
import { Segmented, Slider, Toggle } from './controls/controls';
import { APP_VERSION } from '../version';
import { CompassRose } from './icons';

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

function ViewMenu() {
  const view = useDoc((s) => s.doc.view);
  const setView = useDoc((s) => s.setView);
  const units = useEditor((s) => s.units);
  useDoc((s) => s.meta);
  const flat = !!editor.model?.geo.flat;
  return (
    <div className="view-menu">
      <h4>Map style</h4>
      <div className="style-cards">
        {(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((id) => {
          const s = STYLE_PRESETS[id];
          return (
            <button key={id} className={'style-card' + (view.style === id ? ' on' : '')} onClick={() => setView({ style: id })}>
              <span className="style-swatch">
                <i style={{ background: s.water[Math.min(3, s.water.length - 1)][1] }} />
                <i style={{ background: s.land[Math.min(2, s.land.length - 1)][1] }} />
                <i style={{ background: s.land[Math.floor(s.land.length * 0.6)][1] }} />
                <i style={{ background: s.biomes[1] }} />
              </span>
              <b>{s.name}</b>
              <small>{s.description}</small>
            </button>
          );
        })}
      </div>
      <h4>Relief</h4>
      <Slider label="Hill shading" value={view.hillshade} min={0} max={2} step={0.05} onChange={(v) => setView({ hillshade: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <Toggle label="Coastal ripples" checked={view.coastRipples} onChange={(v) => setView({ coastRipples: v })} />
      <h4>Elevation</h4>
      <Toggle label="Contour lines" checked={view.contours} onChange={(v) => setView({ contours: v })} />
      {view.contours && (
        <Segmented
          label="Interval"
          value={String(view.contourInterval)}
          options={['100', '250', '500', '1000', '2000'].map((v) => ({
            value: v,
            label: units === 'imperial' ? formatHeight(Number(v), units) : `${Number(v) >= 1000 ? Number(v) / 1000 + 'k' : v}`,
          }))}
          onChange={(v) => setView({ contourInterval: Number(v) })}
        />
      )}
      <Toggle label="Height overlay (hypsometric)" checked={view.heightOverlay} onChange={(v) => setView({ heightOverlay: v })} />
      <Toggle label="Peak markers" checked={view.showPeaks} onChange={(v) => setView({ showPeaks: v })} />
      {view.showPeaks && (
        <Slider label="Show peaks above" value={view.peakMinElevation} min={300} max={9000} step={100} onChange={(v) => setView({ peakMinElevation: v })} format={(v) => formatHeight(v, units)} />
      )}
      <h4>{flat ? 'Map' : 'Geography'}</h4>
      <Toggle label={flat ? 'Distance grid' : 'Latitude / longitude grid'} checked={view.graticule} onChange={(v) => setView({ graticule: v })} />
      {!flat && (
        <Toggle
          label="Repeat map horizontally"
          checked={view.repeat !== false}
          onChange={(v) => setView({ repeat: v })}
          hint="Only changes how the map is shown: the planet itself stays round and continuous."
        />
      )}
    </div>
  );
}

/** Global display units: kilometres and metres, or miles and feet. */
function UnitsSwitch() {
  const units = useEditor((s) => s.units);
  return (
    <div className="units-switch" role="group" aria-label="Units">
      <button className={units === 'metric' ? 'on' : ''} onClick={() => setUnits('metric')} title="Metric: km, km², m" aria-pressed={units === 'metric'}>
        km
      </button>
      <button className={units === 'imperial' ? 'on' : ''} onClick={() => setUnits('imperial')} title="Imperial: mi, mi², ft" aria-pressed={units === 'imperial'}>
        mi
      </button>
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
      <Popover
        align="right"
        button={(open, toggle) => (
          <button className={'icon-btn' + (open ? ' on' : '')} onClick={toggle} title="Community" aria-label="Community links">
            <Users size={18} />
          </button>
        )}
      >
        <nav className="community-menu" aria-label="Community">
          <h4>Community</h4>
          {COMMUNITY_LINKS.map((l) => (
            <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer">
              <span>
                <b>{l.label}</b>
                <small>{l.detail}</small>
              </span>
              <ExternalLink size={13} aria-hidden />
            </a>
          ))}
        </nav>
      </Popover>
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
