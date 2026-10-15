export const SRC_DIR: string;
export const LOCALES_DIR: string;
export function extractKeys(code: string): string[];
export function collectKeys(srcDir?: string): string[];
export function placeholders(text: string): string[];
export function readLocales(dir?: string): Record<string, Record<string, string>>;
