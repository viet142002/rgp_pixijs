import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import { advanceMinutes, formatTime } from "../engine/world/time.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("World", () => {
  it("time advances per tick", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 123, data });
    const startDay = engine.state.time.day;
    const startMin = engine.state.time.hour * 60 + engine.state.time.minute;
    engine.tickWorld();
    const newMin = engine.state.time.hour * 60 + engine.state.time.minute;
    expect(newMin).toBe(startMin + 1);
    void startDay;
  });

  it("day changes after 1440 ticks", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 456, data });
    const startDay = engine.state.time.day;
    for (let i = 0; i < 1440; i++) engine.tickWorld();
    expect(engine.state.time.day).toBe(startDay + 1);
  });

  it("formatTime works", () => {
    const t = { day: 3, hour: 14, minute: 30, phase: "noon" as const, weather: "clear" as const, weatherDaysLeft: 3 };
    expect(formatTime(t)).toBe("Ngày 3, 14:30 (Trưa)");
  });

  it("advanceMinutes wraps correctly", () => {
    const t = { day: 0, hour: 23, minute: 59, phase: "night" as const, weather: "clear" as const, weatherDaysLeft: 3 };
    advanceMinutes(t, 5);
    expect(t.day).toBe(1);
    expect(t.hour).toBe(0);
    expect(t.minute).toBe(4);
  });

  it("AI ticks NPCs without crash", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 789, data });
    for (let i = 0; i < 100; i++) engine.tickWorld();
    // NPCs should still exist and be alive
    expect(engine.state.npcs.size).toBeGreaterThan(0);
    for (const npc of engine.state.npcs.values()) {
      expect(npc.alive).toBe(true);
    }
  });
});
