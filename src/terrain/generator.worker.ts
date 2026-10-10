import { generate, previewImage, type GenParams } from './generator';

export type WorkerRequest = { kind: 'generate'; params: GenParams } | { kind: 'preview'; id: number; params: GenParams };
export type WorkerReply =
  | { kind: 'progress'; stage: string; fraction: number }
  | { kind: 'done'; result: ReturnType<typeof generate> }
  | { kind: 'preview'; id: number; image: Uint8ClampedArray; w: number; h: number }
  | { kind: 'error'; id?: number; error: string };

const post = (m: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.kind === 'preview') {
      const r = generate(req.params);
      const image = previewImage(r, req.params.W);
      post({ kind: 'preview', id: req.id, image, w: req.params.W, h: req.params.H }, [image.buffer as ArrayBuffer]);
      return;
    }
    let last = 0;
    let lastStage = '';
    const r = generate(req.params, (stage, fraction) => {
      const now = performance.now();
      if (stage === lastStage && now - last < 120) return;
      last = now;
      lastStage = stage;
      post({ kind: 'progress', stage, fraction });
    });
    const transfer: Transferable[] = [r.height.buffer as ArrayBuffer];
    if (r.biome) transfer.push(r.biome.buffer as ArrayBuffer);
    post({ kind: 'done', result: r }, transfer);
  } catch (err) {
    post({ kind: 'error', id: req.kind === 'preview' ? req.id : undefined, error: String(err) });
  }
};
