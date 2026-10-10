const HIDE_KEY = 'loremapper.shareHidden';

/** Whether to offer sharing after an image export (it can be turned off for good). */
export function shouldOfferShare(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function hideShareOffer() {
  try {
    localStorage.setItem(HIDE_KEY, '1');
  } catch {
    // remembering the choice is a convenience only
  }
}
