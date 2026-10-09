export function selectionTitle(kind: string | undefined, count: number): string {
  if (count > 1) return `${count} selected`;
  const name = { object: 'object', path: 'river / road', territory: 'territory', label: 'label', peak: 'peak' }[kind ?? ''] ?? 'item';
  return `Selected ${name}`;
}
