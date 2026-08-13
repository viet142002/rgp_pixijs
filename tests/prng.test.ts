import { describe, it, expect } from "vitest";
import {
  prngInit, prngNext, prngInt, prngPick, prngShuffle,
  deriveSeed, serializeState, deserializeState,
} from "../engine/seed/prng.js";

describe("PRNG", () => {
  it("is deterministic with same seed", () => {
    const a = prngInit(12345);
    const b = prngInit(12345);
    for (let i = 0; i < 100; i++) {
      const ra = prngNext(a);
      const rb = prngNext(b);
      expect(ra.value).toBe(rb.value);
    }
  });

  it("produces values in [0, 1)", () => {
    let s = prngInit(42);
    for (let i = 0; i < 1000; i++) {
      const { value, state } = prngNext(s);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      s = state;
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = prngInit(1);
    const b = prngInit(2);
    const ra = prngNext(a);
    const rb = prngNext(b);
    expect(ra.value).not.toBe(rb.value);
  });

  it("prngInt produces integer in range", () => {
    let s = prngInit(100);
    for (let i = 0; i < 100; i++) {
      const { value, state } = prngInt(s, 5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(10);
      s = state;
    }
  });

  it("prngPick returns element from array", () => {
    const arr = [1, 2, 3, 4, 5];
    let s = prngInit(50);
    for (let i = 0; i < 50; i++) {
      const { value, state } = prngPick(s, arr);
      expect(arr).toContain(value);
      s = state;
    }
  });

  it("prngShuffle preserves elements", () => {
    const arr = [1, 2, 3, 4, 5];
    const { value } = prngShuffle(prngInit(99), arr);
    expect(value.sort()).toEqual(arr);
  });

  it("deriveSeed produces different seeds for different labels", () => {
    const a = deriveSeed(12345, "world");
    const b = deriveSeed(12345, "combat");
    expect(a).not.toBe(b);
  });

  it("deriveSeed is deterministic", () => {
    const a = deriveSeed(12345, "world");
    const b = deriveSeed(12345, "world");
    expect(a).toBe(b);
  });

  it("serialize/deserialize roundtrip", () => {
    const s = prngInit(777);
    const { state: next } = prngNext(s);
    const ser = serializeState(next);
    const de = deserializeState(ser);
    expect(de).toBe(next);
  });
});
