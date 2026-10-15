import { DRAGONS, MONSTERS } from './creatures';
import { FEATURES } from './features';
import type { StarterAsset } from './kit';
import { FARMS, MOUNTAINS, RESOURCES } from './nature';
import { POLITICAL } from './political';
import { SETTLEMENTS } from './settlements';
import { N_ } from '../../i18n/mark';

export type { StarterAsset } from './kit';

/**
 * The built-in starter pack. The editor only depends on this list's shape
 * (id, name, category, tags, svg, aspect) — swap or extend it freely.
 */
export const STARTER_CATEGORIES: string[] = [
  N_('Settlements'),
  N_('Dragons'),
  N_('Monsters'),
  N_('Mountains'),
  N_('Farms'),
  N_('Mining & resources'),
  N_('Political & cultural'),
  N_('World features'),
  N_('Custom'),
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
