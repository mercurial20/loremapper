/**
 * Mark a text for translation where it's defined; it is translated where it's
 * shown, with `t()`. Kept free of imports so data modules (and the workers
 * that use them) don't pull in i18next.
 */
export function N_<T extends string>(text: T): T {
  return text;
}
