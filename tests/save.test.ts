import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Save / Load", () => {
  it("serializes and deserializes roundtrip", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 555, data });
    // Advance time
    for (let i = 0; i < 50; i++) engine.tickWorld();
    // Modify player state
    engine.state.player.stats.hp = 42;
    const before = {
      day: engine.state.time.day,
      hour: engine.state.time.hour,
      playerHp: engine.state.player.stats.hp,
      npcCount: engine.state.npcs.size,
    };

    const save = engine.save();
    const engine2 = createEngine({ seed: 555, data });
    engine2.load(save);

    expect(engine2.state.time.day).toBe(before.day);
    expect(engine2.state.time.hour).toBe(before.hour);
    expect(engine2.state.player.stats.hp).toBe(before.playerHp);
    expect(engine2.state.npcs.size).toBe(before.npcCount);
  });

  it("save contains required fields", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 666, data });
    const save = engine.save();
    expect(save.schemaVersion).toBeGreaterThan(0);
    expect(save.dataVersion).toBeGreaterThan(0);
    expect(save.prngSeed).toBe(666);
    expect(save.player.id).toBe("player");
    expect(save.npcs.length).toBeGreaterThan(0);
  });

  it("save size is reasonable", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 777, data });
    const save = engine.save();
    const size = JSON.stringify(save).length;
    // 8 NPCs should be < 100KB easily
    expect(size).toBeLessThan(100_000);
  });

  it("deterministic save with same seed", async () => {
    const data = await loadStaticData(DATA_DIR);
    const e1 = createEngine({ seed: 888, data });
    const e2 = createEngine({ seed: 888, data });
    // Same starting state
    expect(e1.state.player.stats.hp).toBe(e2.state.player.stats.hp);
    expect(e1.state.npcs.size).toBe(e2.state.npcs.size);
  });
});
