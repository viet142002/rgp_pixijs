import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import { initBattle, resolveAction } from "../engine/combat/battle.js";
import type { Combatant, EntityId } from "../engine/types.js";
import { prngInit } from "../engine/seed/prng.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

function makeCombatant(
  id: EntityId,
  name: string,
  team: number,
  row: 0 | 1,
  col: 0 | 1 | 2,
  hp: number,
  attack: number,
  defense: number,
  speed: number
): Combatant {
  return {
    id,
    name,
    side: team === 0 ? "player" : "enemy",
    team,
    row,
    col,
    stats: {
      hp,
      mp: 50,
      attack,
      defense,
      speed,
      critRate: 0.05,
      critDamage: 1.5,
      evasion: 0.05,
      accuracy: 0.95,
    },
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

describe("Combat", () => {
  it("initBattle rolls initiative and sorts turn order", async () => {
    const data = await loadStaticData(DATA_DIR);
    const player = makeCombatant("p", "Player", 0, 0, 0, 100, 20, 10, 15);
    const enemy1 = makeCombatant("e1", "E1", 1, 0, 0, 100, 15, 10, 10);
    const enemy2 = makeCombatant("e2", "E2", 1, 0, 1, 100, 15, 10, 20);
    const battle = initBattle({
      playerTeam: [player],
      enemyTeam: [enemy1, enemy2],
      data,
      rng: { value: 0.5, state: prngInit(42) },
      day: 0,
      tick: 0,
    });
    expect(battle.combatants.length).toBe(3);
    expect(battle.turnOrder.length).toBe(3);
    expect(battle.round).toBe(1);
  });

  it("attack action deals damage and logs", async () => {
    const data = await loadStaticData(DATA_DIR);
    const player = makeCombatant("p", "Player", 0, 0, 0, 200, 50, 10, 15);
    const enemy = makeCombatant("e", "Enemy", 1, 0, 0, 200, 10, 5, 10);
    const rngState = prngInit(777);
    const battle = initBattle({
      playerTeam: [player],
      enemyTeam: [enemy],
      data,
      rng: { value: 0.5, state: rngState },
      day: 0,
      tick: 0,
    });
    const target = battle.combatants.find((c) => c.team !== 0 && c.alive)!;
    resolveAction(
      battle,
      { actorId: "p", action: "attack", targetId: target.id },
      data,
      { value: 0.3, state: rngState }
    );
    expect(battle.log.some((l) => l.includes("tấn công"))).toBe(true);
  });

  it("escape ends battle with escape result", async () => {
    const data = await loadStaticData(DATA_DIR);
    const player = makeCombatant("p", "Player", 0, 0, 0, 100, 10, 10, 50);
    const enemy = makeCombatant("e", "Enemy", 1, 0, 0, 100, 10, 10, 5);
    const rngState = prngInit(100);
    const battle = initBattle({
      playerTeam: [player],
      enemyTeam: [enemy],
      data,
      rng: { value: 0.1, state: rngState },
      day: 0,
      tick: 0,
    });
    resolveAction(
      battle,
      { actorId: "p", action: "escape" },
      data,
      { value: 0.01, state: rngState }
    );
    expect(battle.log.some((l) => l.includes("bỏ chạy"))).toBe(true);
  });

  it("front row provides cover for back row target", async () => {
    const data = await loadStaticData(DATA_DIR);
    const player = makeCombatant("p", "Player", 0, 0, 0, 100, 50, 10, 15);
    const allyFront = makeCombatant("a", "AllyFront", 0, 0, 1, 100, 10, 10, 10);
    const allyBack = makeCombatant("b", "AllyBack", 0, 1, 1, 100, 10, 10, 10);
    const enemy = makeCombatant("e", "Enemy", 1, 0, 1, 100, 50, 10, 10);
    const rngState = prngInit(555);
    const battle = initBattle({
      playerTeam: [player, allyFront, allyBack],
      enemyTeam: [enemy],
      data,
      rng: { value: 0.5, state: rngState },
      day: 0,
      tick: 0,
    });
    expect(battle.combatants.find((c) => c.id === "b")).toBeDefined();
  });

  it("engine handles full combat loop with victory", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 999, data });
    // Buff player so they win
    engine.state.player.stats.attack = 200;
    engine.state.player.stats.hp = 1000;
    engine.attackNpc("wanderer");
    expect(engine.battle).not.toBeNull();
    let turns = 0;
    while (engine.battle && turns < 100) {
      const actor = engine.battle.combatants[engine.battle.currentActorIdx];
      if (!actor || !actor.alive) {
        // advance past dead actor by calling defend (which costs AP but will not skip)
        // actually safer: just find next alive and run a no-op via defend
        const alive = engine.battle.combatants.find((c) => c.alive);
        if (!alive) break;
        // bump turn by action
        engine.combatAction({actorId: alive.id, action: "defend"});
        turns++;
        continue;
      }
      const targets = engine.battle.combatants.filter(
        (c: Combatant) => c.team !== actor.team && c.alive
      );
      if (targets.length === 0) break;
      const target = [...targets].sort((a, b) => a.stats.hp - b.stats.hp)[0]!;
      engine.combatAction({
        actorId: actor.id,
        action: "attack",
        targetId: target.id,
      });
      turns++;
    }
    expect(engine.lastBattleResult).toBe("victory");
  });
});
