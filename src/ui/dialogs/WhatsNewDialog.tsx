import { useTranslation } from 'react-i18next';
import { ANNOUNCEMENT, ANNOUNCEMENT_KEY } from '../../announcement';
import { track } from '../../analytics';
import { COMMUNITY_LINKS } from '../../community';
import { N_ } from '../../i18n';
import { setSetting } from '../../persistence/db';
import { useEditor } from '../../store/editorStore';
import { APP_VERSION } from '../../version';
import { Modal } from './Modal';

/**
 * What is new in this release, for those who used Loremapper before it: shown once after the
 * update (not on a first visit, not to viewers of a shared map), and from the top bar again.
 * Rewrite NEWS, and bump ANNOUNCEMENT, for the next one.
 */

type Action = 'generate' | 'sources' | 'ranges';

interface News {
  id: Action | 'wind';
  title: string;
  text: string;
  image: string;
  alpha?: boolean;
  /** What "Try it" does. */
  action: Action;
}

const NEWS: News[] = [
  {
    id: 'generate',
    title: N_('A new world generator'),
    text: N_(
      'Worlds are made at their true size: a mountain range is 100–200 km wide on a map of any size. Valleys cut into the land, ranges with valleys along them, rivers that start in the hills. Small maps have presets of their own (part of a continent, coast, peninsula, island, meteorite crater…); big maps have continents of real size with seas between them.',
    ),
    image: 'whats-new/generator.webp',
    action: 'generate',
  },
  {
    id: 'wind',
    title: N_('Wind and climate'),
    text: N_(
      'Flat maps have a prevailing wind: where it blows from, how strong, how moist and how warm. Slopes facing it are wet and wooded, the land behind a range lies in its rain shadow. Find it under Advanced settings when you generate.',
    ),
    image: 'whats-new/wind.webp',
    action: 'generate',
  },
  {
    id: 'sources',
    title: N_('Water from a source'),
    text: N_(
      'Place a source and its water finds its own way: a river follows the slope, meanders and leaves oxbow lakes, fills hollows into lakes and runs on through them, losing water on the way in dry land. River tool → From a source.',
    ),
    image: 'whats-new/sources.webp',
    alpha: true,
    action: 'sources',
  },
  {
    id: 'ranges',
    title: N_('Mountain ranges you can edit'),
    text: N_(
      "A generated world's mountains are ranges you can select and change: height, width, how the width varies along them, another variant. New settings decide how much of the land they cover.",
    ),
    image: 'whats-new/ranges.webp',
    action: 'ranges',
  },
];

export function WhatsNewDialog() {
  const { t } = useTranslation();
  const set = useEditor((s) => s.set);
  const close = () => {
    void setSetting(ANNOUNCEMENT_KEY, ANNOUNCEMENT);
    track('whats_new', { action: 'close' });
    set({ dialog: null });
  };
  const tryIt = (n: News) => {
    void setSetting(ANNOUNCEMENT_KEY, ANNOUNCEMENT);
    track('whats_new', { action: n.id });
    if (n.action === 'generate') set({ dialog: 'generate' });
    else if (n.action === 'sources') {
      set({ dialog: null, riverMode: 'source' });
      useEditor.getState().setTool('river');
    } else {
      set({ dialog: null, rangeMode: 'lines' });
      useEditor.getState().setTool('ridge');
    }
  };
  return (
    <Modal
      title={t("What's new in Loremapper {v}", { v: ANNOUNCEMENT })}
      onClose={close}
      wide
      footer={
        <div className="whats-new-foot">
          <small className="muted">
            {t('Your maps stay as they are. To get the new terrain, generate a world again.')}{' '}
            <a href={`${COMMUNITY_LINKS.github.href}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer">
              {t('All changes')}
            </a>{' '}
            · v{APP_VERSION}
          </small>
          <button className="btn primary" onClick={close}>
            {t('Got it')}
          </button>
        </div>
      }
    >
      <div className="whats-new">
        {NEWS.map((n) => (
          <article key={n.id} className="whats-new-card">
            <img src={n.image} alt="" loading="lazy" />
            <div className="whats-new-text">
              <h3>
                {t(n.title)} {n.alpha && <span className="alpha-badge static">{t('alpha')}</span>}
              </h3>
              <p>{t(n.text)}</p>
              <button className="btn small" onClick={() => tryIt(n)}>
                {t('Try it')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </Modal>
  );
}
