import { Globe2, LoaderCircle, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { PROJECTIONS } from './core/projections';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { surfaceAreaKm2 } from './core/planet';
import { formatArea } from './core/units';
import { STYLE_PRESETS } from './render/styles';
import { useDoc } from './store/docStore';
import { togglePanel, useEditor } from './store/editorStore';
import { ExportDialog } from './ui/dialogs/ExportDialog';
import { GenerateDialog } from './ui/dialogs/GenerateDialog';
import { PlanetDialog } from './ui/dialogs/PlanetDialog';
import { ProjectsDialog } from './ui/dialogs/ProjectsDialog';
import { ShareDialog } from './ui/dialogs/ShareDialog';
import { ShortcutsDialog } from './ui/dialogs/ShortcutsDialog';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { CompassRose } from './ui/icons';
import { MapView } from './ui/MapView';
import { MiniGlobe } from './ui/MiniGlobe';
import { NewMapFlow, WelcomeScreen } from './ui/NewMap';
import { Modal } from './ui/dialogs/Modal';
import { AssetPanel } from './ui/panels/AssetPanel';
import { RightPanel } from './ui/RightPanel';
import { ScaleBar, StatusBar } from './ui/StatusBar';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';

function Toast() {
  const toast = useEditor((s) => s.toast);
  const set = useEditor((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => set({ toast: null }), toast.kind === 'error' ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [toast, set]);
  if (!toast) return null;
  return (
    <div className={'toast ' + toast.kind} role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}

/** Shown while a planet is viewed in another projection. */
function ProjectionBanner() {
  const { t } = useTranslation();
  const vp = useEditor((s) => s.viewProjection);
  const readOnly = useEditor((s) => s.readOnly);
  const set = useEditor((s) => s.set);
  if (!vp) return null;
  const name = PROJECTIONS.find((p) => p.id === vp.id)?.name ?? vp.id;
  return (
    <div className="projection-banner" role="status">
      <Globe2 size={14} /> <b>{t(name)}</b> <span>{readOnly ? t('Drag to turn, pinch to zoom') : t('View only: drag to look around, Info shows what is there')}</span>
      <button className="btn small" onClick={() => set({ viewProjection: null })}>
        {readOnly ? t('Flat map') : t('Edit map')}
      </button>
    </div>
  );
}

function PanelToggle() {
  const { t } = useTranslation();
  const hidden = useEditor((s) => s.panelHidden);
  return (
    <button className="panel-toggle" onClick={() => togglePanel()} title={hidden ? t('Show the panel ({key})', { key: '\\' }) : t('Hide the panel for more map ({key})', { key: '\\' })} aria-label={hidden ? t('Show the panel') : t('Hide the panel')} aria-pressed={!hidden}>
      {hidden ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
    </button>
  );
}

/** First-run guidance shown over an empty ocean planet. */
function Welcome() {
  const { t } = useTranslation();
  const stats = useEditor((s) => s.landStats);
  const busy = useEditor((s) => s.busy);
  const set = useEditor((s) => s.set);
  const setTool = useEditor((s) => s.setTool);
  const objects = useDoc((s) => Object.keys(s.doc.objects).length);
  const planet = useDoc((s) => s.meta?.planet);
  const units = useEditor((s) => s.units);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || busy || !stats || !planet || stats.areaKm2 > 0 || objects > 0) return null;
  const flat = planet.mapType === 'flat';
  return (
    <div className="welcome">
      <h3>{flat ? t('An empty map') : t('An empty ocean world')}</h3>
      <p>
        {(flat ? t('A flat map of {area}, all water. Sculpt land by hand or let the generator draft it for you — everything stays editable.', { area: formatArea(surfaceAreaKm2(planet), units) }) : t('A planet of {area}, all water. Sculpt land by hand or let the generator draft it for you — everything stays editable.', { area: formatArea(surfaceAreaKm2(planet), units) }))}
      </p>
      <div className="btn-row">
        <button
          className="btn primary"
          onClick={() => {
            setTool('raise');
            setDismissed(true);
          }}
        >
          {t('Raise land')} <kbd>R</kbd>
        </button>
        <button className="btn" onClick={() => set({ dialog: 'generate' })}>
          {t('Generate a world…')}
        </button>
        <button className="btn ghost" onClick={() => setDismissed(true)}>
          {t('Dismiss')}
        </button>
      </div>
    </div>
  );
}

function Busy() {
  const { t } = useTranslation();
  const busy = useEditor((s) => s.busy);
  const cancel = useEditor((s) => s.busyCancel);
  if (!busy) return null;
  return (
    <div className="busy">
      <LoaderCircle className="spin" size={22} />
      <span>{busy}</span>
      {cancel && (
        <button className="btn small" onClick={cancel}>
          {t('Cancel')}
        </button>
      )}
    </div>
  );
}

/** The viewer's one-line note: editing is a desktop thing. */
function ViewerNotice() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="viewer-notice" role="note">
      <span>{t('For the full map editing experience, open LoreMapper in a desktop browser.')}</span>
      <button className="icon-btn small" onClick={() => setHidden(true)} aria-label={t('Dismiss')}>
        ×
      </button>
    </div>
  );
}

function NewMapDialog() {
  const { t } = useTranslation();
  const set = useEditor((s) => s.set);
  const close = () => set({ dialog: null });
  return (
    <Modal title={t('New map')} wide onClose={close}>
      <NewMapFlow onCancel={close} onCreated={close} />
    </Modal>
  );
}

function Dialogs() {
  const dialog = useEditor((s) => s.dialog);
  switch (dialog) {
    case 'projects':
      return <ProjectsDialog />;
    case 'export':
      return <ExportDialog />;
    case 'generate':
      return <GenerateDialog />;
    case 'planet':
      return <PlanetDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'newProject':
      return <NewMapDialog />;
    case 'share':
      return <ShareDialog />;
    default:
      return null;
  }
}

export default function App() {
  const assetPanelOpen = useEditor((s) => s.assetPanelOpen);
  const welcome = useEditor((s) => s.welcome);
  const readOnly = useEditor((s) => s.readOnly);
  // the whole tree re-renders when the language changes, so texts formatted outside React (units, notices) follow too
  const { t } = useTranslation();
  const panelHidden = useEditor((s) => s.panelHidden);
  const projected = useEditor((s) => s.viewProjection !== null);
  const style = useDoc((s) => s.doc.view.style);
  const preset = STYLE_PRESETS[style] ?? STYLE_PRESETS.parchment;
  return (
    <div className={'app' + (readOnly ? ' viewer' : '') + (panelHidden ? ' panel-hidden' : '') + (projected ? ' projected' : '')}>
      <ErrorBoundary label={t('Top bar')}>
        <TopBar />
      </ErrorBoundary>
      <div className="workspace">
        {!readOnly && <Toolbar />}
        {assetPanelOpen && !readOnly && (
          <ErrorBoundary label={t('Asset library')}>
            <AssetPanel />
          </ErrorBoundary>
        )}
        <main className="stage" data-style={style}>
          <MapView />
          <div className="vignette" style={{ background: preset.vignette }} />
          <div className="map-chrome compass">
            <CompassRose size={70} />
          </div>
          <div className="map-chrome scale">
            <ScaleBar />
          </div>
          <PanelToggle />
          <ProjectionBanner />
          <MiniGlobe />
          <Toast />
          {readOnly ? <ViewerNotice /> : <Welcome />}
          <Busy />
        </main>
        {!panelHidden && (
          <ErrorBoundary label={t('Inspector')}>
            <RightPanel />
          </ErrorBoundary>
        )}
      </div>
      <ErrorBoundary label={t('Status bar')}>
        <StatusBar />
      </ErrorBoundary>
      <ErrorBoundary label={t('Dialog')}>
        <Dialogs />
      </ErrorBoundary>
      {welcome && (
        <ErrorBoundary label={t('Welcome')}>
          <WelcomeScreen viewer={readOnly} />
        </ErrorBoundary>
      )}
    </div>
  );
}
