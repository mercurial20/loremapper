import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { surfaceAreaKm2 } from './core/planet';
import { formatArea } from './core/units';
import { STYLE_PRESETS } from './render/styles';
import { useDoc } from './store/docStore';
import { useEditor } from './store/editorStore';
import { ExportDialog } from './ui/dialogs/ExportDialog';
import { GenerateDialog } from './ui/dialogs/GenerateDialog';
import { PlanetDialog } from './ui/dialogs/PlanetDialog';
import { ProjectsDialog } from './ui/dialogs/ProjectsDialog';
import { ShortcutsDialog } from './ui/dialogs/ShortcutsDialog';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { CompassRose } from './ui/icons';
import { MapView } from './ui/MapView';
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

/** First-run guidance shown over an empty ocean planet. */
function Welcome() {
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
      <h3>{flat ? 'An empty map' : 'An empty ocean world'}</h3>
      <p>
        {flat ? 'A flat map' : 'A planet'} of {formatArea(surfaceAreaKm2(planet), units)}, all water. Sculpt land by hand or let the generator draft it for you — everything
        stays editable.
      </p>
      <div className="btn-row">
        <button
          className="btn primary"
          onClick={() => {
            setTool('raise');
            setDismissed(true);
          }}
        >
          Raise land <kbd>R</kbd>
        </button>
        <button className="btn" onClick={() => set({ dialog: 'generate' })}>
          Generate a world…
        </button>
        <button className="btn ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function Busy() {
  const busy = useEditor((s) => s.busy);
  const cancel = useEditor((s) => s.busyCancel);
  if (!busy) return null;
  return (
    <div className="busy">
      <LoaderCircle className="spin" size={22} />
      <span>{busy}</span>
      {cancel && (
        <button className="btn small" onClick={cancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

function NewMapDialog() {
  const set = useEditor((s) => s.set);
  const close = () => set({ dialog: null });
  return (
    <Modal title="New map" wide onClose={close}>
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
    default:
      return null;
  }
}

export default function App() {
  const assetPanelOpen = useEditor((s) => s.assetPanelOpen);
  const welcome = useEditor((s) => s.welcome);
  const style = useDoc((s) => s.doc.view.style);
  const preset = STYLE_PRESETS[style] ?? STYLE_PRESETS.parchment;
  return (
    <div className="app">
      <ErrorBoundary label="Top bar">
        <TopBar />
      </ErrorBoundary>
      <div className="workspace">
        <Toolbar />
        {assetPanelOpen && (
          <ErrorBoundary label="Asset library">
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
          <Toast />
          <Welcome />
          <Busy />
        </main>
        <ErrorBoundary label="Inspector">
          <RightPanel />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="Status bar">
        <StatusBar />
      </ErrorBoundary>
      <ErrorBoundary label="Dialog">
        <Dialogs />
      </ErrorBoundary>
      {welcome && (
        <ErrorBoundary label="Welcome">
          <WelcomeScreen />
        </ErrorBoundary>
      )}
    </div>
  );
}
