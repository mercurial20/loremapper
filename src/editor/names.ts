import { uid } from '../core/math';
import { labelOwn } from '../model/names';
import { NAME_STYLE_KEYS, type MapLabel, type NameGroup, type NameStyle, type NameStyleKey } from '../model/types';
import { useDoc } from '../store/docStore';
import { t } from '../i18n';

/*
 * Name groups and the style of each name: a group's style is shared by its names, and a name may
 * set any property of its own (and drop it again to follow the group).
 */

const commit = (...a: Parameters<ReturnType<typeof useDoc.getState>['commit']>) => useDoc.getState().commit(...a);

export function updateNameGroup(id: string, patch: Partial<Omit<NameGroup, 'style'>> & { style?: Partial<NameStyle> }, mergeKey?: string) {
  commit(
    t('Edit name group'),
    (d) => ({ nameGroups: d.nameGroups.map((g) => (g.id === id ? { ...g, ...patch, style: { ...g.style, ...(patch.style ?? {}) } } : g)) }),
    mergeKey,
  );
}

/** A new group of the user's own, styled like `from` (default: the Labels group). */
export function addNameGroup(name: string, from?: NameGroup): string {
  const id = uid('names-');
  const base = from ?? useDoc.getState().doc.nameGroups.find((g) => g.kind === 'labels')!;
  commit(t('New name group'), (d) => ({ nameGroups: [...d.nameGroups, { id, name, kind: 'custom', style: { ...base.style }, visible: true, always: false }] }));
  return id;
}

/** Delete a group of the user's own; its names go back to their built-in groups. */
export function deleteNameGroup(id: string) {
  commit(t('Delete name group'), (d) => {
    const drop = <T extends object>(coll: Record<string, T>, key: keyof T): Record<string, T> => {
      let changed = false;
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(coll)) {
        if ((v as Record<string, unknown>)[key as string] === id) {
          const c = { ...v } as Record<string, unknown>;
          delete c[key as string];
          out[k] = c as T;
          changed = true;
        } else out[k] = v;
      }
      return changed ? out : coll;
    };
    return {
      nameGroups: d.nameGroups.filter((g) => g.id !== id),
      labels: drop(d.labels, 'group'),
      objects: drop(d.objects, 'nameGroup'),
      paths: drop(d.paths, 'nameGroup'),
      peaks: drop(d.peaks, 'nameGroup'),
    };
  });
}

/** A label's property set on the label itself (it no longer follows its group there). */
export function labelStylePatch(l: MapLabel, key: NameStyleKey, value: NameStyle[NameStyleKey]): Partial<MapLabel> {
  const own = labelOwn(l);
  return { [key]: value, own: own.includes(key) ? own : [...own, key] } as Partial<MapLabel>;
}

/** A label following its group again for these properties (all when none are given). */
export function labelResetPatch(l: MapLabel, keys: NameStyleKey[] = NAME_STYLE_KEYS): Partial<MapLabel> {
  return { own: labelOwn(l).filter((k) => !keys.includes(k)) };
}

/** An item's own style with one property set, or dropped (`undefined`) to follow its group. */
export function ownStylePatch(own: Partial<NameStyle> | undefined, key: NameStyleKey, value: NameStyle[NameStyleKey] | undefined): Partial<NameStyle> | undefined {
  const out: Partial<NameStyle> = { ...(own ?? {}) };
  if (value === undefined) delete out[key];
  else (out as Record<string, unknown>)[key] = value;
  return Object.keys(out).length ? out : undefined;
}
