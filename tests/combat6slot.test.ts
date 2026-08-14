import { describe, it, expect } from "vitest";
import {
  calcCover,
  selectTargets,
  swapPositions,
  shiftRowsOnDeath,
  detectFlanking,
  findEmptySlot,
  GRID_ROWS,
  GRID_COLS,
} from "../engine/combat/grid.js";
import type { Combatant } from "../engine/types.js";

function mk(
  id: string,
  team: number,
  row: 0 | 1,
  col: 0 | 1 | 2,
  hp = 100
): Combatant {
  return {
    id,
    name: id,
    side: team === 0 ? "player" : "enemy",
    team,
    row,
    col,
    stats: { hp, mp: 50, maxHp: hp, maxMp: 50, attack: 50, defense: 10, speed: 10, critRate: 0.05, critDamage: 1.5, evasion: 0.05, accuracy: 0.95 },
    element: "fire",
    elementResist: {},
    traits: [],
    states: [],
    statuses: [],
    ap: 3,
    maxAp: 3,
    combo: 0,
    alive: true,
  };
}

describe("Grid constants", () => {
  it("2 rows x 3 cols = 6 slots per side", () => {
    expect(GRID_ROWS).toBe(2);
    expect(GRID_COLS).toBe(3);
  });
});

describe("6-slot Cover (spec B5)", () => {
  it("front row has no cover", () => {
    const atk = mk("a", 0, 0, 0);
    const front = mk("f", 1, 0, 0);
    expect(calcCover(front, atk, [atk, front])).toBe(0);
  });

  it("back row covered by alive front ally in same col", () => {
    const atk = mk("a", 0, 0, 0);
    const front = mk("f", 1, 0, 1);
    const back = mk("b", 1, 1, 1);
    expect(calcCover(back, atk, [atk, front, back])).toBeGreaterThan(0);
  });

  it("back row not covered when front ally dead (flanking)", () => {
    const atk = mk("a", 0, 0, 0);
    const deadFront = { ...mk("f", 1, 0, 1), alive: false };
    const back = mk("b", 1, 1, 1);
    expect(calcCover(back, atk, [atk, deadFront, back])).toBe(0);
  });

  it("back row has 0 cover when front col empty (no ally at all)", () => {
    const atk = mk("a", 0, 0, 0);
    const back = mk("b", 1, 1, 2);
    expect(calcCover(back, atk, [atk, back])).toBe(0);
  });

  it("adjacent front allies stack cover up to cap", () => {
    const atk = mk("a", 0, 0, 0);
    // Front ally at SAME col as back target + adjacent allies
    const f0 = mk("f0", 1, 0, 0);
    const f1 = mk("f1", 1, 0, 1); // same col as b1 → cover provider
    const f2 = mk("f2", 1, 0, 2);
    const b1 = mk("b1", 1, 1, 1);
    const cover = calcCover(b1, atk, [atk, f0, f1, f2, b1]);
    // 0.3 base + 0.1 * 2 adj (f0 and f2) = 0.5
    expect(cover).toBeCloseTo(0.5, 5);
  });

  it("cover capped at 0.7", () => {
    const atk = mk("a", 0, 0, 0);
    // Make 3 front allies all adjacent to col 1
    const f0 = mk("f0", 1, 0, 0);
    const f1 = mk("f1", 1, 0, 1);
    const f2 = mk("f2", 1, 0, 2);
    const b1 = mk("b1", 1, 1, 1);
    const cover = calcCover(b1, atk, [atk, f0, f1, f2, b1]);
    expect(cover).toBeLessThanOrEqual(0.7);
  });
});

describe("6-slot Flanking (spec B5)", () => {
  it("detectFlanking: no front ally in col → flanked", () => {
    const atk = mk("a", 0, 0, 0);
    const back = mk("b", 1, 1, 1);
    expect(detectFlanking(back, atk, [atk, back])).toBe(true);
  });

  it("detectFlanking: alive front in col → not flanked", () => {
    const atk = mk("a", 0, 0, 0);
    const f1 = mk("f1", 1, 0, 1);
    const b1 = mk("b1", 1, 1, 1);
    expect(detectFlanking(b1, atk, [atk, f1, b1])).toBe(false);
  });
});

describe("6-slot Targeting patterns", () => {
  it("line: hits full enemy row matching attacker row", () => {
    const atk = mk("a", 0, 0, 0);
    const e1 = mk("e1", 1, 0, 0);
    const e2 = mk("e2", 1, 0, 1);
    const e3 = mk("e3", 1, 0, 2);
    const bk = mk("bk", 1, 1, 0);
    const targets = selectTargets(atk, "line", undefined, [atk, e1, e2, e3, bk]);
    expect(targets.length).toBe(3);
    expect(targets.every((c) => c.row === 0)).toBe(true);
  });

  it("line: back-row attacker can target enemy front-row col when own front empty (gap)", () => {
    const atk = mk("a", 0, 1, 1);
    const enemyFront = mk("ef", 1, 0, 1);
    const enemyBack = mk("eb", 1, 1, 1);
    const targets = selectTargets(atk, "line", undefined, [atk, enemyFront, enemyBack]);
    // Own front col 1 empty → can hit enemyFront col 1 via gap + enemyBack (same row)
    expect(targets.map((c) => c.id).sort()).toEqual(["eb", "ef"]);
  });

  it("cone: 3 enemies centered on attacker's col", () => {
    const atk = mk("a", 0, 0, 1);
    const e0 = mk("e0", 1, 0, 0);
    const e1 = mk("e1", 1, 0, 1);
    const e2 = mk("e2", 1, 0, 2);
    const far = mk("far", 1, 0, 2);
    far.col = 0;
    const targets = selectTargets(atk, "cone", undefined, [atk, e0, e1, e2]);
    expect(targets.length).toBe(3);
    expect(targets.map((c) => c.col).sort()).toEqual([0, 1, 2]);
  });

  it("radial: 3x3 around explicit target", () => {
    const atk = mk("a", 0, 0, 0);
    const eCenter = mk("ec", 1, 1, 1);
    const eAdjL = mk("el", 1, 1, 0);
    const eAdjR = mk("er", 1, 1, 2);
    const eFront = mk("ef", 1, 0, 1);
    const eFar = mk("far", 1, 1, 0); far:
    void eFar;
    const eFar2 = mk("far2", 1, 0, 2);
    const targets = selectTargets(atk, "radial", "ec", [
      atk, eCenter, eAdjL, eAdjR, eFront, eFar2,
    ]);
    const ids = targets.map((c) => c.id).sort();
    expect(ids).toContain("ec");
    expect(ids).toContain("el");
    expect(ids).toContain("er");
    expect(ids).toContain("ef");
    expect(ids).not.toContain("far2");
  });

  it("all_enemies and all_allies work on 6-slot field", () => {
    const atk = mk("a", 0, 0, 0);
    const friends = [mk("p1", 0, 0, 1), mk("p2", 0, 1, 0)];
    const foes = [mk("e1", 1, 0, 0), mk("e2", 1, 1, 2)];
    const all = [atk, ...friends, ...foes];
    expect(selectTargets(atk, "all_enemies", undefined, all).length).toBe(2);
    expect(selectTargets(atk, "all_allies", undefined, all).length).toBe(2);
  });
});

describe("6-slot Row operations", () => {
  it("swapPositions: swaps two allies", () => {
    const a = mk("a", 0, 0, 0);
    const b = mk("b", 0, 1, 0);
    expect(swapPositions([a, b], "a", "b")).toBe(true);
    expect(a.row).toBe(1);
    expect(b.row).toBe(0);
  });

  it("swapPositions: refuses cross-team swap", () => {
    const a = mk("a", 0, 0, 0);
    const e = mk("e", 1, 0, 0);
    expect(swapPositions([a, e], "a", "e")).toBe(false);
    expect(a.row).toBe(0);
    expect(e.row).toBe(0);
  });

  it("swapPositions: refuses dead combatant", () => {
    const a = mk("a", 0, 0, 0);
    const b = { ...mk("b", 0, 1, 0), alive: false };
    expect(swapPositions([a, b], "a", "b")).toBe(false);
  });

  it("shiftRowsOnDeath: promotes back when front col empty", () => {
    const front = { ...mk("f", 1, 0, 1), alive: false };
    const back = mk("b", 1, 1, 1);
    const promoted = shiftRowsOnDeath([front, back]);
    expect(promoted).toEqual(["b"]);
    expect(back.row).toBe(0);
  });

  it("shiftRowsOnDeath: no promotion when front alive", () => {
    const front = mk("f", 1, 0, 1);
    const back = mk("b", 1, 1, 1);
    const promoted = shiftRowsOnDeath([front, back]);
    expect(promoted).toEqual([]);
    expect(back.row).toBe(1);
  });

  it("shiftRowsOnDeath: handles both teams", () => {
    const pf = { ...mk("pf", 0, 0, 0), alive: false };
    const pb = mk("pb", 0, 1, 0);
    const ef = { ...mk("ef", 1, 0, 2), alive: false };
    const eb = mk("eb", 1, 1, 2);
    const promoted = shiftRowsOnDeath([pf, pb, ef, eb]);
    expect(promoted.sort()).toEqual(["eb", "pb"]);
  });

  it("findEmptySlot returns first free slot per team", () => {
    const used = [
      mk("a", 0, 0, 0),
      mk("b", 0, 0, 1),
      mk("c", 0, 0, 2),
    ];
    const slot = findEmptySlot(used, 0);
    expect(slot).toEqual({ row: 1, col: 0 });
  });

  it("findEmptySlot returns null when team full", () => {
    const all = [
      mk("a", 0, 0, 0), mk("b", 0, 0, 1), mk("c", 0, 0, 2),
      mk("d", 0, 1, 0), mk("e", 0, 1, 1), mk("f", 0, 1, 2),
    ];
    expect(findEmptySlot(all, 0)).toBeNull();
  });
});
