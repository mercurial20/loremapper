import { t } from '../../i18n';

export function selectionTitle(kind: string | undefined, count: number): string {
  if (count > 1) return t('{n} selected', { n: count });
  switch (kind) {
    case 'object':
      return t('Selected object');
    case 'path':
      return t('Selected river / road');
    case 'territory':
      return t('Selected territory');
    case 'label':
      return t('Selected label');
    case 'peak':
      return t('Selected peak');
    default:
      return t('Selected item');
  }
}
