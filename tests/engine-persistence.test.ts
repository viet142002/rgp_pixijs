import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";
import { createSaveManager } from "../engine/persistence/saveManager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Engine ↔ SaveManager integration", () => {
  it("saveToSlot + loadFromSlot roundtrips via IDB", async () => {
    const data = await loadStaticData(DATA_DIR);
    const mgr = createSaveManager();
    const engine = createEngine({ seed: 111, data, saveManager: mgr });

    for (let i = 0; i < 20; i++) engine.tickWorld();
    engine.state.player.stats.hp = 88;

    const { payload, meta } = await engine.saveToSlot(1);
    expect(meta).not.toBeNull();
    expect(meta!.slot).toBe(1);
    expect(payload.player.stats.hp).toBe(88);

    // Second engine reuses same SaveManager (same DB).
    const engine2 = createEngine({ seed: 999, data, saveManager: mgr });
    const loaded = await engine2.loadFromSlot(1);
    expect(loaded).not.toBeNull();
    expect(engine2.state.player.stats.hp).toBe(88);
  });

  it("auto-save fires after configured tick interval", async () => {
    const data = await loadStaticData(DATA_DIR);
    const mgr = createSaveManager();
    const engine = createEngine({
      seed: 222, data, saveManager: mgr, autoSaveEveryTicks: 10,
    });

    for (let i = 0; i < 9; i++) engine.tickWorld();
    // Wait briefly so any pending microtask resolves.
    await new Promise((r) => setTimeout(r, 5));
    expect(await mgr.load(1, "auto")).toBeNull();

    // 10th tick crosses threshold.
    engine.tickWorld();
    await new Promise((r) => setTimeout(r, 20));
    const saved = await mgr.load(1, "auto");
    expect(saved).not.toBeNull();
    expect(engine.lastAutoSave).not.toBeNull();
    expect(engine.lastAutoSave!.kind).toBe("auto");
  });

  it("auto-save disabled when no saveManager", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 333, data });
    for (let i = 0; i < 50; i++) engine.tickWorld();
    expect(engine.lastAutoSave).toBeNull();
    expect(engine.autoSaveEveryTicks).toBe(0);
  });

  it("listSaves returns auto + manual saves", async () => {
    const data = await loadStaticData(DATA_DIR);
    const mgr = createSaveManager();
    const engine = createEngine({
      seed: 444, data, saveManager: mgr, autoSaveEveryTicks: 5,
    });

    await engine.saveToSlot(1); // manual slot 1
    for (let i = 0; i < 5; i++) engine.tickWorld();
    await new Promise((r) => setTimeout(r, 20));

    const list = await engine.listSaves();
    const kinds = list.map((m) => m.kind).sort();
    expect(kinds).toContain("manual");
    expect(kinds).toContain("auto");
  });

  it("loadFromSlot throws without saveManager", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 555, data });
    await expect(engine.loadFromSlot(1)).rejects.toThrow(/saveManager/);
  });

  it("deleteSave removes a slot", async () => {
    const data = await loadStaticData(DATA_DIR);
    const mgr = createSaveManager();
    const engine = createEngine({ seed: 666, data, saveManager: mgr });
    await engine.saveToSlot(1);
    await engine.saveToSlot(2);
    await engine.deleteSave(1);
    const list = await engine.listSaves();
    expect(list.find((m) => m.slot === 1 && m.kind === "manual")).toBeUndefined();
    expect(list.find((m) => m.slot === 2 && m.kind === "manual")).toBeDefined();
  });
});
