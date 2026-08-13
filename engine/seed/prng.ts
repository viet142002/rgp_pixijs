/**
 * PRNG — Pseudo-Random Number Generator
 *
 * Uses Mulberry32: small, fast, good statistical distribution.
 * Deterministic: same seed → same sequence.
 *
 * Sub-seeds derived via splitmix32 for independent streams
 * (world, ai, combat, loot).
 */

export type PrngState = number;

const MASK32 = 0xffffffff;

/**
 * Initialize PRNG state from a seed.
 */
export function prngInit(seed: number): PrngState {
  // Ensure unsigned 32-bit
  return (seed >>> 0) || 1;
}

/**
 * Next random value in [0, 1).
 */
export function prngNext(state: PrngState): { value: number; state: PrngState } {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const next = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value: next, state: t >>> 0 };
}

/**
 * Random integer in [min, max] inclusive.
 */
export function prngInt(state: PrngState, min: number, max: number): { value: number; state: PrngState } {
  const { value, state: next } = prngNext(state);
  const range = max - min + 1;
  return { value: Math.floor(value * range) + min, state: next };
}

/**
 * Pick random element from array.
 */
export function prngPick<T>(state: PrngState, arr: readonly T[]): { value: T | undefined; state: PrngState } {
  if (arr.length === 0) return { value: undefined, state };
  const { value: idx, state: next } = prngInt(state, 0, arr.length - 1);
  return { value: arr[idx], state: next };
}

/**
 * Pick weighted random. Items: [{item, weight}].
 */
export function prngPickWeighted<T>(
  state: PrngState,
  items: ReadonlyArray<{ item: T; weight: number }>
): { value: T | undefined; state: PrngState } {
  if (items.length === 0) return { value: undefined, state };
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0) return { value: items[0]?.item, state };

  const { value: roll, state: next } = prngNext(state);
  const target = roll * total;
  let acc = 0;
  for (const { item, weight } of items) {
    acc += Math.max(0, weight);
    if (target < acc) return { value: item, state: next };
  }
  return { value: items[items.length - 1]?.item, state: next };
}

/**
 * Fisher-Yates shuffle (deterministic).
 */
export function prngShuffle<T>(state: PrngState, arr: readonly T[]): { value: T[]; state: PrngState } {
  const result = arr.slice();
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const { value: j, state: ns } = prngInt(s, 0, i);
    s = ns;
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return { value: result, state: s };
}

/**
 * Roll chance [0, 1]. Returns true if value < chance.
 */
export function prngChance(state: PrngState, chance: number): { value: boolean; state: PrngState } {
  const { value, state: next } = prngNext(state);
  return { value: value < chance, state: next };
}

/**
 * Derive a sub-seed from master seed + label.
 * Uses splitmix32 for good independence.
 */
export function deriveSeed(master: number, label: string | number): number {
  let h = (master >>> 0) ^ hashLabel(label);
  h = (h + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function hashLabel(label: string | number): number {
  const str = String(label);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Serialize state to string (for save).
 */
export function serializeState(state: PrngState): string {
  return (state >>> 0).toString(36);
}

/**
 * Deserialize state from string.
 */
export function deserializeState(s: string): PrngState {
  return parseInt(s, 36) >>> 0;
}

// Silence unused warning for MASK32 (kept for clarity)
void MASK32;
