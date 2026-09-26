export type Random = (() => number) & { index?: (max: number) => number };
// Rejection sampling avoids bias when 2^32 isn't divisible by the range.
export function secureIndex(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw Error('Rango inválido.');
  const limit = 0x100000000 - (0x100000000 % max);
  const word = new Uint32Array(1);
  do { crypto.getRandomValues(word); } while (word[0] >= limit);
  return word[0] % max;
}
export const secureRandom: Random = Object.assign(() => secureIndex(0x100000000) / 0x100000000, { index: secureIndex });
