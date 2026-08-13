import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Hatred Propagation", () => {
  it("killing NPC propagates hatred to witnesses", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 11111, data });
    // Buff player so they win
    engine.state.player.stats.attack = 200;
    engine.state.player.stats.hp = 1000;
    // Move wanderer near other NPCs (witness range = 8 tiles = 256px)
    const wanderer = engine.getNpc("wanderer")!;
    const elder = engine.getNpc("village_elder")!;
    wanderer.position = { x: 400, y: 400 };
    elder.position = { x: 420, y: 420 }; // ~28px away, within witness range

    const beforeCount = engine.totalNpcsWithGrudgeOnPlayer();

    // Kill wanderer via combat
    engine.attackNpc("wanderer");
    let turns = 0;
    while (engine.battle && turns < 100) {
      const actor = engine.battle.combatants[engine.battle.currentActorIdx];
      if (!actor || !actor.alive) {
        const alive = engine.battle.combatants.find((c) => c.alive);
        if (!alive) break;
        engine.combatAction({actorId: alive.id, action: "defend"});
        turns++;
        continue;
      }
      const targets = engine.battle.combatants.filter(
        (c: import("../engine/types.js").Combatant) => c.team !== actor.team && c.alive
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
    const afterCount = engine.totalNpcsWithGrudgeOnPlayer();
    expect(afterCount).toBeGreaterThan(beforeCount);
    const elderGrudge = engine.getGrudgesAgainstPlayer("village_elder");
    expect(elderGrudge).toBeGreaterThan(0);
  });

  it("grudge decays over time", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 22222, data });
    const guard = engine.getNpc("village_guard")!;
    guard.grudge.push({
      target: "player",
      type: "attacked",
      strength: 50,
      decay: 1,
      day: 0,
    });

    // Tick world enough for many days (1 tick = 1 minute, so 1440 ticks = 1 day)
    for (let i = 0; i < 1440 * 30; i++) {
      engine.tickWorld();
    }

    const afterGrudge = engine.getGrudgesAgainstPlayer("village_guard");
    expect(afterGrudge).toBeLessThan(50);
  });

  it("faction cascade grants hatred to faction members", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 33333, data });
    // Buff player so they win
    engine.state.player.stats.attack = 200;
    engine.state.player.stats.hp = 1000;
    // Position all village NPCs close together
    for (const npc of engine.listNpcs()) {
      npc.position = { x: 500, y: 500 };
    }

    engine.attackNpc("village_guard");
    let turns = 0;
    while (engine.battle && turns < 100) {
      const actor = engine.battle.combatants[engine.battle.currentActorIdx];
      if (!actor || !actor.alive) {
        const alive = engine.battle.combatants.find((c) => c.alive);
        if (!alive) break;
        engine.combatAction({actorId: alive.id, action: "defend"});
        turns++;
        continue;
      }
      const targets = engine.battle.combatants.filter(
        (c: import("../engine/types.js").Combatant) => c.team !== actor.team && c.alive
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
    const count = engine.totalNpcsWithGrudgeOnPlayer();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
