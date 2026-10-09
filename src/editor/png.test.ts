import { describe, expect, it } from 'vitest';
import { crc32 } from './png';

describe('PNG CRC-32', () => {
  it('matches the well-known CRC of the IEND chunk type', () => {
    const iend = new TextEncoder().encode('IEND');
    expect(crc32(iend, 0, 4)).toBe(0xae426082);
  });
});
