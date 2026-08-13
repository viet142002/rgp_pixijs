import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import {
  inspectPlayer, inspectWorld, saveSnapshot, fullReport, serializeForDebug,
} from "../engine/tooling/inspector.js";
import {
  SCENARIOS, listScenarios, applyScenario,
} from "../engine/tooling/scenarios.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Inspector", () => {
  it("inspectPlayer returns array of strings", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90001, data });
    const lines = inspectPlayer(engine);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.join("\n")).toContain("hp=");
  });

  it("inspectWorld includes day/time/phase", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90002, data });
    const lines = inspectWorld(engine);
    const out = lines.join("\n");
    expect(out).toContain("day=");
    expect(out).toContain("phase=");
  });

  it("saveSnapshot is single-line", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90003, data });
    const snap = saveSnapshot(engine);
    expect(snap).not.toContain("\n");
    expect(snap).toContain("seed=");
    expect(snap).toContain("day=");
  });

  it("fullReport contains player + world + factions", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90004, data });
    const r = fullReport(engine);
    expect(r).toContain("ENGINE STATE");
    expect(r).toContain("PLAYER");
    expect(r).toContain("FACTIONS");
  });

  it("serializeForDebug returns JSON-safe object", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90005, data });
    const obj = serializeForDebug(engine);
    expect(() => JSON.stringify(obj)).not.toThrow();
  });
});

describe("Scenario Launcher", () => {
  it("SCENARIOS has 5+ presets", () => {
    expect(Object.keys(SCENARIOS).length).toBeGreaterThanOrEqual(5);
  });

  it("listScenarios returns formatted list", () => {
    const lines = listScenarios();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.length).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain("peaceful_start");
  });

  it("applyScenario peaceful_start sets gold=100", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90006, data });
    applyScenario(engine, "peaceful_start");
    expect(engine.state.player.gold).toBe(100);
  });

  it("applyScenario war_zone adds faction war", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90007, data });
    applyScenario(engine, "war_zone");
    expect(engine.state.factionWars.length).toBeGreaterThan(0);
    expect(engine.isFactionAtWar("thanh_van_sect", "demon_sect")).toBe(true);
  });

  it("applyScenario endgame_demo grants legendary materials", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90008, data });
    applyScenario(engine, "endgame_demo");
    expect(engine.state.player.realm).toBe("kim_dan");
    expect(engine.state.player.gold).toBe(9999);
    const has = engine.state.player.inventory.some((it) => it.itemId === "cuu_chau_thuy_tinh");
    expect(has).toBe(true);
  });

  it("applyScenario ascension_attempt sets Nguyên Anh", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90009, data });
    applyScenario(engine, "ascension_attempt");
    expect(engine.state.player.realm).toBe("nguyen_anh");
  });

  it("applyScenario debug_sandbox sets ascension flag", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90010, data });
    applyScenario(engine, "debug_sandbox");
    expect(engine.state.player.flags["ascended"]).toBe(true);
  });

  it("applyScenario returns false for unknown id", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 90011, data });
    expect(applyScenario(engine, "nonexistent")).toBe(false);
  });
});