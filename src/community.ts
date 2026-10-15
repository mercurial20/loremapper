import { N_ } from './i18n/mark';

/**
 * Community links shown in the header. Only confirmed addresses belong here;
 * add the official X account once it exists.
 */
export const COMMUNITY_LINKS = {
  github: { label: 'GitHub', title: N_('Source code on GitHub (mercurial20/loremapper)'), href: 'https://github.com/mercurial20/loremapper' },
  reddit: { label: 'Reddit', title: N_('r/LoreMapper on Reddit: share maps, ask questions'), href: 'https://www.reddit.com/r/LoreMapper/' },
  redditSubmit: { label: N_('Share on r/LoreMapper'), title: N_('Post your map on r/LoreMapper'), href: 'https://www.reddit.com/r/LoreMapper/submit/?screen_view_count=1' },
  suggestWorld: { label: N_('Suggest a world'), title: N_('Suggest a new built-in world on GitHub'), href: 'https://github.com/mercurial20/loremapper/issues/new?template=world_preset.yml' },
  feedback: { label: N_('Feedback'), title: N_('Report a bug or suggest a feature (GitHub issues)'), href: 'https://github.com/mercurial20/loremapper/issues/new/choose' },
};
