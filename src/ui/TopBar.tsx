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
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { history } from '../model/history';
import type { StylePresetId } from '../model/types';
import { STYLE_PRESETS } from '../render/styles';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { UnitsSwitch } from './UnitsSwitch';
import { LanguageSwitch } from './LanguageSwitch';
import { formatHeight } from '../core/units';
import { COMMUNITY_LINKS } from '../community';
import { editor } from '../editor/Editor';
import { PROJECTIONS, type ProjectionId, type ProjectionParams } from '../core/projections';
import { Segmented, Select, Slider } from './controls/controls';
import { APP_VERSION } from '../version';
import { CompassRose, GitHubMark, RedditMark } from './icons';
import { track } from '../analytics';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const status = useEditor((s) => s.saveStatus);
  if (status === 'saving' || status === 'pending')
    return (
      <span className="save-ind saving" title={t('Your work is saved automatically to this browser')}>
        <LoaderCircle size={14} className="spin" /> <span>{t('Saving…')}</span>
      </span>
    );
  if (status === 'error')
    return (
      <span className="save-ind error" title={t('Saving failed — export your project as a backup')}>
        <CircleAlert size={14} /> <span>{t('Not saved')}</span>
      </span>
    );
  return (
    <span className="save-ind" title={t('Saved locally in this browser (IndexedDB)')}>
      <Check size={14} /> <span>{t('Saved')}</span>
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

/** Planets: look at the map in another projection (editing stays on the equirectangular map). */
function ProjectionControls() {
  const { t } = useTranslation();
  const vp = useEditor((s) => s.viewProjection);
  const set = useEditor((s) => s.set);
  const id: ProjectionId = vp?.id ?? 'equirectangular';
  const choose = (next: ProjectionId) => {
    if (next === 'equirectangular') return set({ viewProjection: null });
    const lat0 = next === 'azimuthal' ? 90 : next === 'orthographic' ? 25 : (vp?.lat0 ?? 0);
    set({ viewProjection: { id: next, lon0: vp?.lon0 ?? 0, lat0, extent: vp?.extent ?? 180 } });
  };
  const upd = (p: Partial<ProjectionParams>) => vp && set({ viewProjection: { ...vp, ...p } });
  const centred = id === 'orthographic' || id === 'azimuthal';
  return (
    <>
      <h4>{t('Projection')}</h4>
      <Select<ProjectionId>
        label=""
        value={id}
        options={PROJECTIONS.map((p) => ({ value: p.id, label: p.id === 'equirectangular' ? t('Equirectangular (editable)') : t(p.name) }))}
        onChange={choose}
      />
      {vp && (
        <>
          <p className="style-desc">
            {t(PROJECTIONS.find((p) => p.id === id)?.description ?? '')}{' '}
            {centred ? t('Drag the map to turn it; Info works here, and any editing tool brings back the editable map.') : t('Drag the map to move around; Info works here, and any editing tool brings back the editable map.')}
          </p>
          <Slider
            label={centred ? t('Centre longitude') : t('Central meridian')}
            value={vp.lon0}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => upd({ lon0: v })}
            format={(v) => `${Math.abs(Math.round(v))}° ${v < 0 ? t('W') : t('E')}`}
          />
          {centred && (
            <Slider
              label={t('Centre latitude')}
              value={vp.lat0}
              min={-90}
              max={90}
              step={1}
              onChange={(v) => upd({ lat0: v })}
              format={(v) => (Math.round(v) === 90 ? t('North pole') : Math.round(v) === -90 ? t('South pole') : `${Math.abs(Math.round(v))}° ${v < 0 ? t('S') : t('N')}`)}
            />
          )}
          {id === 'azimuthal' && (
            <>
              <div className="view-chips">
                <button className={'view-chip' + (vp.lat0 === 90 ? ' on' : '')} onClick={() => upd({ lat0: 90 })}>
                  {t('North pole')}
                </button>
                <button className={'view-chip' + (vp.lat0 === -90 ? ' on' : '')} onClick={() => upd({ lat0: -90 })}>
                  {t('South pole')}
                </button>
                <button className={'view-chip' + (vp.extent === 90 ? ' on' : '')} onClick={() => upd({ extent: vp.extent === 90 ? 180 : 90 })}>
                  {t('One hemisphere')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function ViewMenu() {
  const { t } = useTranslation();
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
      <h4>{t('Map style')}</h4>
      <div className="style-tiles">
        {(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((id) => {
          const s = STYLE_PRESETS[id];
          return (
            <button key={id} className={'style-tile' + (view.style === id ? ' on' : '')} onClick={() => {
                setView({ style: id });
                track('style_changed', { style: id });
              }}
              title={t(s.description)}
              aria-pressed={view.style === id}
            >
              <StyleThumb s={s} />
              <span>{t(s.name)}</span>
            </button>
          );
        })}
      </div>
      <p className="style-desc">{t(current.description)}</p>
      {!flat && <ProjectionControls />}
      <h4>{t('Relief')}</h4>
      <Slider label={t('Hill shading')} value={view.hillshade} min={0} max={2} step={0.05} onChange={(v) => setView({ hillshade: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <Slider
        label={t('Biome edges')}
        value={view.biomeSoftness ?? 0.7}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => setView({ biomeSoftness: v })}
        format={(v) => (v < 0.2 ? t('Crisp') : v < 0.5 ? t('Natural') : v < 0.8 ? t('Soft') : t('Very soft'))}
      />
      <h4>{t('Show on map')}</h4>
      <div className="view-chips">
        {chip(t('Contours'), view.contours, () => setView({ contours: !view.contours }), t('Contour lines'))}
        {chip(t('Height colours'), view.heightOverlay, () => setView({ heightOverlay: !view.heightOverlay }), t('Hypsometric tints by elevation'))}
        {chip(t('Peaks'), view.showPeaks, () => setView({ showPeaks: !view.showPeaks }), t('Peak markers with their heights'))}
        {chip(t('Coastal ripples'), view.coastRipples, () => setView({ coastRipples: !view.coastRipples }))}
        {chip(flat ? t('Distance grid') : t('Lat / long grid'), view.graticule, () => setView({ graticule: !view.graticule }))}
        {!flat && chip(t('Repeat sideways'), view.repeat !== false, () => setView({ repeat: view.repeat === false }), t('Only changes how the planet is shown: it stays round and continuous'))}
      </div>
      {view.contours && (
        <Segmented
          label={t('Contour interval')}
          value={String(view.contourInterval)}
          options={['100', '250', '500', '1000', '2000'].map((v) => ({
            value: v,
            label: units === 'imperial' ? formatHeight(Number(v), units) : `${Number(v) >= 1000 ? Number(v) / 1000 + 'k' : v}`,
          }))}
          onChange={(v) => setView({ contourInterval: Number(v) })}
        />
      )}
      {view.showPeaks && (
        <Slider label={t('Show peaks above')} value={view.peakMinElevation} min={300} max={9000} step={100} onChange={(v) => setView({ peakMinElevation: v })} format={(v) => formatHeight(v, units)} />
      )}
    </div>
  );
}

/** The most compact header step (see the `data-fit` rules in app.css). */
const MAX_FIT = 5;

/**
 * Pick the roomiest header layout whose contents fit, leaving a little slack
 * for texts that change (the save status). Measured rather than set by screen
 * width, because the texts' lengths depend on the language.
 */
function useHeaderFit() {
  const ref = useRef<HTMLElement>(null);
  const fitted = useRef('');
  const fit = () => {
    const el = ref.current;
    const spacer = el?.querySelector('.spacer');
    if (!el || !spacer) return;
    // the header re-renders often while drawing; trying the layouts makes the browser lay the page
    // out again each time, so they are only tried when its texts or the window's width change
    const sig = `${window.innerWidth}|${el.textContent}`;
    if (sig === fitted.current) return;
    fitted.current = sig;
    for (let level = 0; level <= MAX_FIT; level++) {
      el.dataset.fit = String(level);
      if (el.scrollWidth <= el.clientWidth && spacer.getBoundingClientRect().width >= 24) return;
    }
  };
  // after every render (texts, language, project name) and on resize
  useLayoutEffect(fit);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
  return ref;
}

export function TopBar() {
  const { t } = useTranslation();
  const header = useHeaderFit();
  const meta = useDoc((s) => s.meta);
  const setMeta = useDoc((s) => s.setMeta);
  const { canUndo, canRedo, undoLabel, redoLabel, fogPreview, set } = useEditor();
  const view = useDoc((s) => s.doc.view);
  const setView = useDoc((s) => s.setView);
  const readOnly = useEditor((s) => s.readOnly);
  return (
    <header ref={header} className={'topbar' + (readOnly ? ' viewer' : '')}>
      <div className="brand">
        <CompassRose size={26} />
        <span>Loremapper</span>
        <em className="beta" title={t('Version {v}', { v: APP_VERSION })}>beta</em>
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
          aria-label={t('Map name')}
          spellCheck={false}
          readOnly={readOnly}
        />
        <button className="btn ghost" onClick={() => set({ dialog: 'projects' })} title={t('All maps')}>
          {t('Maps')} <ChevronDown size={14} />
        </button>
      </div>
      {!readOnly && (
        <div className="tb-group">
          <button className="icon-btn" disabled={!canUndo} onClick={() => history.undo()} title={canUndo ? t('Undo {action} (Ctrl+Z)', { action: t(undoLabel ?? '') }) : t('Nothing to undo')}>
            <Undo2 size={18} />
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={() => history.redo()} title={canRedo ? t('Redo {action} (Ctrl+Shift+Z)', { action: t(redoLabel ?? '') }) : t('Nothing to redo')}>
            <Redo2 size={18} />
          </button>
        </div>
      )}
      <div className="tb-group">
        {!readOnly && (
          <button className="btn" onClick={() => set({ dialog: 'generate' })} title={t('Generate world')}>
            <WandSparkles size={16} /> <span>{t('Generate')}</span>
          </button>
        )}
        <Popover
          button={(open, toggle) => (
            <button className={'btn' + (open ? ' on' : '')} onClick={toggle} title={t('View')}>
              <SlidersHorizontal size={16} /> <span>{t('View')}</span> <ChevronDown size={14} />
            </button>
          )}
        >
          <ViewMenu />
        </Popover>
        <button className={'chip' + (view.contours ? ' on' : '')} onClick={() => setView({ contours: !view.contours })} title={t('Contour lines')}>
          {t('Contours')}
        </button>
        <button className={'chip' + (view.heightOverlay ? ' on' : '')} onClick={() => setView({ heightOverlay: !view.heightOverlay })} title={t('Height overlay')}>
          {t('Height')}
        </button>
        <button className={'chip' + (fogPreview ? ' on' : '')} onClick={() => set({ fogPreview: !fogPreview })} title={t('Show content hidden by fog (editor only)')}>
          {fogPreview ? <Eye size={14} /> : <EyeOff size={14} />} <CloudFog size={14} /> {fogPreview ? t('See through fog') : t('Player view')}
        </button>
      </div>
      <div className="spacer" />
      {!readOnly && <SaveIndicator />}
      <UnitsSwitch />
      <LanguageSwitch />
      <nav className="community-links" aria-label={t('Community')}>
        <a href={COMMUNITY_LINKS.github.href} target="_blank" rel="noopener noreferrer" title={t(COMMUNITY_LINKS.github.title)}>
          <GitHubMark /> <span>{COMMUNITY_LINKS.github.label}</span>
        </a>
        <a className="reddit" href={COMMUNITY_LINKS.reddit.href} target="_blank" rel="noopener noreferrer" title={t(COMMUNITY_LINKS.reddit.title)}>
          <RedditMark /> <span>{COMMUNITY_LINKS.reddit.label}</span>
        </a>
        <a href={COMMUNITY_LINKS.feedback.href} target="_blank" rel="noopener noreferrer" title={t(COMMUNITY_LINKS.feedback.title)} aria-label={t(COMMUNITY_LINKS.feedback.title)}>
          <MessageSquarePlus size={16} />
        </a>
      </nav>
      {!readOnly && (
        <>
          <button className="icon-btn" onClick={() => set({ dialog: 'planet' })} title={t('Map settings')}>
            <Globe size={18} />
          </button>
          <button className="icon-btn" onClick={() => set({ dialog: 'shortcuts' })} title={t('Keyboard shortcuts (?)')}>
            <Keyboard size={18} />
          </button>
          <button className="btn primary" onClick={() => set({ dialog: 'export' })}>
            <Download size={16} /> {t('Export')}
          </button>
        </>
      )}
    </header>
  );
}
