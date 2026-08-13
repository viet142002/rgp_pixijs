import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import { calcCover } from "../engine/combat/grid.js";
import { initBattle, resolveAction } from "../engine/combat/battle.js";
import { selectTargets } from "../engine/combat/grid.js";
import type { Combatant } from "../engine/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

function mkCombatant(
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
    stats: { hp, mp: 50, attack: 50, defense: 10, speed: 10, critRate: 0.05, critDamage: 1.5, evasion: 0.05, accuracy: 0.95 },
    element: "fire",
    elementResist: {},
    traits: [],
    states: [],
    statuses: [],
    ap: 3,
    maxAp: 3,
    combo: 0,
    alive: true,
  } as Combatant;
}

describe("3v3 Formation", () => {
  it("calcCover returns 0 for front row target", () => {
    const attacker = mkCombatant("atk", 0, 0, 0);
    const front = mkCombatant("f", 1, 0, 0);
    expect(calcCover(front, attacker, [attacker, front])).toBe(0);
  });

  it("calcCover returns > 0 when back row has front-row ally", () => {
    const attacker = mkCombatant("atk", 0, 0, 0);
    const front = mkCombatant("f", 1, 0, 0);
    const back = mkCombatant("b", 1, 1, 0);
    const cover = calcCover(back, attacker, [attacker, front, back]);
    expect(cover).toBeGreaterThan(0);
  });

  it("calcCover returns 0 when front row dead", () => {
    const attacker = mkCombatant("atk", 0, 0, 0);
    const front = { ...mkCombatant("f", 1, 0, 0), alive: false };
    const back = mkCombatant("b", 1, 1, 0);
    expect(calcCover(back, attacker, [attacker, front, back])).toBe(0);
  });

  it("back row gets more cover from adjacent front allies", () => {
    const attacker = mkCombatant("atk", 0, 0, 0);
    const f0 = mkCombatant("f0", 1, 0, 0);
    const b0 = mkCombatant("b0", 1, 1, 0);
    const single = calcCover(b0, attacker, [attacker, f0, b0]);
    const f1 = mkCombatant("f1", 1, 0, 1);
    const withAdj = calcCover(b0, attacker, [attacker, f0, f1, b0]);
    expect(withAdj).toBeGreaterThanOrEqual(single);
  });
});

describe("3v3 Targeting", () => {
  it("all_enemies selects all alive enemies", () => {
    const attacker = mkCombatant("p", 0, 0, 0);
    const e1 = mkCombatant("e1", 1, 0, 0);
    const e2 = mkCombatant("e2", 1, 0, 1);
    const e3 = mkCombatant("e3", 1, 1, 0);
    const targets = selectTargets(attacker, "all_enemies", undefined, [attacker, e1, e2, e3]);
    expect(targets.length).toBe(3);
  });

  it("all_allies selects friendly combatants", () => {
    const p1 = mkCombatant("p1", 0, 0, 0);
    const p2 = mkCombatant("p2", 0, 0, 1);
    const e1 = mkCombatant("e1", 1, 0, 0);
    const targets = selectTargets(p1, "all_allies", undefined, [p1, p2, e1]);
    expect(targets.length).toBe(1);
    expect(targets[0]!.id).toBe("p2");
  });

  it("single targets only the explicit target if alive", () => {
    const p1 = mkCombatant("p1", 0, 0, 0);
    const e1 = mkCombatant("e1", 1, 0, 0);
    const e2 = mkCombatant("e2", 1, 0, 1);
    const targets = selectTargets(p1, "single", "e2", [p1, e1, e2]);
    expect(targets.length).toBe(1);
    expect(targets[0]!.id).toBe("e2");
  });

  it("single with dead target returns empty", () => {
    const p1 = mkCombatant("p1", 0, 0, 0);
    const e1 = { ...mkCombatant("e1", 1, 0, 0), alive: false };
    const e2 = mkCombatant("e2", 1, 0, 1);
    const targets = selectTargets(p1, "single", "e1", [p1, e1, e2]);
    expect(targets.length).toBe(0);
  });
});

describe("3v3 Battle", () => {
  it("initBattle creates 3v3 with proper teams", async () => {
    const data = await loadStaticData(DATA_DIR);
    const playerTeam = [
      mkCombatant("p0", 0, 0, 0, 200),
      mkCombatant("p1", 0, 0, 1, 200),
      mkCombatant("p2", 0, 1, 0, 200),
    ];
    const enemyTeam = [
      mkCombatant("e0", 1, 0, 0, 100),
      mkCombatant("e1", 1, 0, 1, 100),
      mkCombatant("e2", 1, 1, 0, 100),
    ];
    const battle = initBattle({
      playerTeam, enemyTeam, data,
      rng: { value: 0, state: 12345 },
      day: 0, tick: 0,
    });
    expect(battle.combatants.length).toBe(6);
    expect(battle.combatants.filter(c => c.team === 0).length).toBe(3);
    expect(battle.combatants.filter(c => c.team === 1).length).toBe(3);
  });
});

describe("Faction Politics (Batch 2)", () => {
  it("engine.getFactionStance returns stance", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50001, data });
    const stance = engine.getFactionStance("village_council");
    expect(["aggressive", "defensive", "neutral", "opportunistic", "dying"]).toContain(stance);
  });

  it("engine.getAllFactionStances returns map", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50002, data });
    const stances = engine.getAllFactionStances();
    expect(Object.keys(stances).length).toBeGreaterThan(0);
    for (const s of Object.values(stances)) {
      expect(["aggressive", "defensive", "neutral", "opportunistic", "dying"]).toContain(s);
    }
  });

  it("very negative rep → aggressive stance", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50003, data });
    engine.giveRep("village_council", -100, "test");
    const stance = engine.getFactionStance("village_council");
    expect(stance).toBe("aggressive");
  });

  it("very positive rep → opportunistic stance", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50004, data });
    engine.giveRep("thanh_van_sect", 100, "test");
    const stance = engine.getFactionStance("thanh_van_sect");
    expect(stance).toBe("opportunistic");
  });

  it("faction with 0 members → dying stance", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50005, data });
    engine.disbandFaction("village_council");
    const stance = engine.getFactionStance("village_council");
    expect(stance).toBe("dying");
  });

  it("evaluateFactionPolitics runs without crash", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 50006, data });
    expect(() => {
      for (let i = 0; i < 10; i++) engine.tickWorld();
    }).not.toThrow();
  });
});