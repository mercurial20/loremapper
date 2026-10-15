import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { COMMUNITY_LINKS } from '../../community';
import { useEditor } from '../../store/editorStore';
import { RedditMark } from '../icons';
import { Modal } from './Modal';
import { hideShareOffer } from '../share';
import { track } from '../../analytics';
import { Trans, useTranslation } from 'react-i18next';

/** Shown after a map image is saved: an invitation to post it on r/LoreMapper. */
export function ShareDialog() {
  const { t } = useTranslation();
  const set = useEditor((s) => s.set);
  const [hide, setHide] = useState(false);
  const close = () => {
    if (hide) hideShareOffer();
    set({ dialog: null });
  };
  return (
    <Modal
      title={t('Your map is saved')}
      onClose={close}
      footer={
        <div className="btn-row end share-foot">
          <label className="share-hide">
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> {t('Don’t ask again')}
          </label>
          <button className="btn" onClick={close}>
            {t('Not now')}
          </button>
          <a
            className="btn primary"
            href={COMMUNITY_LINKS.redditSubmit.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              track('share_clicked');
              close();
            }}
          >
            <RedditMark size={14} /> {t('Share on r/LoreMapper')} <ExternalLink size={12} />
          </a>
        </div>
      }
    >
      <div className="share-body">
        <span className="share-icon">
          <RedditMark size={34} />
        </span>
        <div>
          <p>
            <Trans i18nKey="Proud of this world? Show it to other mapmakers on <b>r/LoreMapper</b>: post the image you just saved, give your world a name and say a few words about it." components={{ b: <b /> }} />
          </p>
          <p className="hint">{t('Reddit opens in a new tab. Nothing is uploaded from Loremapper; you choose what to post.')}</p>
        </div>
      </div>
    </Modal>
  );
}
