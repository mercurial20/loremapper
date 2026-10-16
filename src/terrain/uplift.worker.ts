import { upliftRelief, type UpliftInput } from './upliftErosion';

/** Carves the uplift of one stroke off the main thread; replies with the relief in metres. */
self.onmessage = (e: MessageEvent<UpliftInput>) => {
  const relief = upliftRelief(e.data);
  (self as unknown as Worker).postMessage(relief, [relief.buffer]);
};
