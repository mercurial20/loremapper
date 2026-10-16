import { rangeRelief, type RangeJob } from './rangeUplift';

/** Carves mountain ranges off the main thread; replies with their relief in metres and their uplift. */
self.onmessage = (e: MessageEvent<RangeJob>) => {
  const out = rangeRelief(e.data);
  (self as unknown as Worker).postMessage(out, [out.relief.buffer, out.uplift.buffer]);
};
