import { generate, type GenParams } from './generator';

self.onmessage = (e: MessageEvent<GenParams>) => {
  try {
    const r = generate(e.data);
    const transfer: Transferable[] = [r.height.buffer as ArrayBuffer];
    if (r.biome) transfer.push(r.biome.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ ok: true, result: r }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
