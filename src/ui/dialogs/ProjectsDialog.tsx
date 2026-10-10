import { Copy, FolderOpen, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { editor } from '../../editor/Editor';
import { importProject } from '../../editor/exporter';
import { deleteProject, duplicateProject, estimateStorage, listProjects, renameProject, type ProjectSummary } from '../../persistence/projects';
import { useDoc } from '../../store/docStore';
import { useEditor } from '../../store/editorStore';
import { Modal } from './Modal';

function Thumb({ blob }: { blob?: Blob }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url ? <img src={url} alt="" /> : <div className="thumb-empty" />;
}

export function ProjectsDialog() {
  const set = useEditor((s) => s.set);
  const notify = useEditor((s) => s.notify);
  const current = useDoc((s) => s.meta?.id);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => set({ dialog: null });
  const refresh = async () => {
    await editor.saveNow();
    const [list, est] = await Promise.all([listProjects(), estimateStorage()]);
    setProjects(list);
    setStorage(est);
  };
  useEffect(() => {
    let alive = true;
    editor
      .saveNow()
      .then(() => Promise.all([listProjects(), estimateStorage()]))
      .then(([list, est]) => {
        if (!alive) return;
        setProjects(list);
        setStorage(est);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Modal title="Your maps" onClose={close} wide>
      <div className="projects-head">
        <button className="btn primary" onClick={() => set({ dialog: 'newProject' })}>
          <Plus size={14} /> New map
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Import project file…
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".loremap,.fantasymap,.zip,application/zip"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await importProject(f);
              close();
            } catch (err) {
              notify(err instanceof Error ? err.message : String(err), 'error');
            }
          }}
        />
        <span className="spacer" />
        {storage && (
          <small className="muted">
            Browser storage: {(storage.usage / 1e6).toFixed(1)} MB used of {(storage.quota / 1e9).toFixed(1)} GB
          </small>
        )}
      </div>
      <div className="project-grid">
        {projects.map((p) => (
          <div key={p.id} className={'project-card' + (p.id === current ? ' current' : '')}>
            <button
              className="project-thumb"
              onClick={async () => {
                close();
                if (p.id !== current) await editor.openProject(p.id);
              }}
              title="Open"
            >
              <Thumb blob={p.thumbnail} />
            </button>
            <div className="project-info">
              <b>{p.name}</b>
              <small>
                {p.id === current ? 'Open now · ' : ''}edited {new Date(p.updatedAt).toLocaleString()}
              </small>
            </div>
            <div className="project-actions">
              <button
                className="icon-btn small"
                title="Open"
                onClick={async () => {
                  close();
                  if (p.id !== current) await editor.openProject(p.id);
                }}
              >
                <FolderOpen size={14} />
              </button>
              <button
                className="icon-btn small"
                title="Rename"
                onClick={async () => {
                  const n = prompt('Rename map', p.name);
                  if (!n?.trim()) return;
                  if (p.id === current) useDoc.getState().setMeta({ name: n.trim() });
                  else await renameProject(p.id, n.trim());
                  await refresh();
                }}
              >
                <Pencil size={14} />
              </button>
              <button
                className="icon-btn small"
                title="Duplicate"
                onClick={async () => {
                  await duplicateProject(p.id, p.name + ' copy');
                  await refresh();
                }}
              >
                <Copy size={14} />
              </button>
              <button
                className="icon-btn small danger"
                title="Delete"
                onClick={async () => {
                  if (!confirm(`Delete “${p.name}” permanently? Export it first if you want a backup.`)) return;
                  await deleteProject(p.id);
                  if (p.id === current) {
                    const rest = (await listProjects()).filter((x) => x.id !== p.id);
                    if (rest[0]) await editor.openProject(rest[0].id);
                    else {
                      close();
                      editor.closeMap();
                      return;
                    }
                  }
                  await refresh();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
