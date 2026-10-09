import { useEffect, useRef } from 'react';
import { assetLibrary } from '../assets/library';
import { addObjects, newObject } from '../editor/commands';
import { editor } from '../editor/Editor';
import { useDoc } from '../store/docStore';
import { useEditor } from '../store/editorStore';
import { tools } from '../tools/ToolController';
import { ASSET_DRAG_TYPE } from './panels/AssetPanel';

/** Hosts the Pixi canvas; wires resize, tools and drag-and-drop placement. */
export function MapView() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    editor.onMounted = () => {
      if (editor.renderer) tools.attach(editor.renderer.canvas);
    };
    tools.installKeyboard();
    void editor.init(el).catch((e) => {
      console.error(e);
      useEditor.getState().set({ busy: null });
      useEditor.getState().notify('Could not start the editor: ' + (e instanceof Error ? e.message : String(e)), 'error');
    });
    const ro = new ResizeObserver(() => editor.renderer?.resize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="map-host"
      ref={host}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (!id || !editor.renderer || !editor.model) return;
        e.preventDefault();
        const r = host.current!.getBoundingClientRect();
        const [x, y] = editor.renderer.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
        if (y < 0 || y > editor.model.H) return;
        const st = useEditor.getState();
        const layer = useDoc.getState().doc.objectLayers.find((l) => l.id === st.activeObjectLayer);
        if (layer?.locked) {
          st.notify(`Layer “${layer.name}” is locked`);
          return;
        }
        if (!assetLibrary.has(id)) return;
        const o = newObject({ assetId: id, x: editor.model.geo.wrapX(x), y, size: st.stamp.sizePx / editor.zoom });
        addObjects([o]);
        st.set({ assetId: id });
        st.select([{ kind: 'object', id: o.id }]);
      }}
    />
  );
}
