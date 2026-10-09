import { DRAGONS, MONSTERS } from './creatures';
import { FEATURES } from './features';
import type { StarterAsset } from './kit';
import { FARMS, MOUNTAINS, RESOURCES } from './nature';
import { POLITICAL } from './political';
import { SETTLEMENTS } from './settlements';

export type { StarterAsset } from './kit';

/**
 * The built-in starter pack. The editor only depends on this list's shape
 * (id, name, category, tags, svg, aspect) — swap or extend it freely.
 */
export const STARTER_CATEGORIES = [
  'Settlements',
  'Dragons',
  'Monsters',
  'Mountains',
  'Farms',
  'Mining & resources',
  'Political & cultural',
  'World features',
  'Custom',
];

export const STARTER_ASSETS: StarterAsset[] = [
  ...SETTLEMENTS,
  ...DRAGONS,
  ...MONSTERS,
  ...MOUNTAINS,
  ...FARMS,
  ...RESOURCES,
  ...POLITICAL,
  ...FEATURES,
];
