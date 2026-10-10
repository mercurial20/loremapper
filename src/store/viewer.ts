/**
 * Phones and tablets get a read-only viewer: touch-first devices without a
 * precise pointer. `?viewer=1` forces it on (and `?viewer=0` off) for testing.
 */
export function detectViewer(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('viewer');
    if (q !== null) return q !== '0';
    return matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}
