import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { loadMods, applyMods, validateModDependencies, topoSortMods } from "../engine/modding/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Mod Loader", () => {
  it("loads example mod from data/mods/example_giac", () => {
    const mods = loadMods(join(DATA_DIR, "mods"));
    const found = mods.find((m) => m.manifest.id === "example_giac");
    expect(found).toBeDefined();
    expect(found!.manifest.name).toContain("Tu Tiên Giác");
    expect(found!.files.npcs?.giac_master).toBeDefined();
  });

  it("mod manifest has required fields", () => {
    const mods = loadMods(join(DATA_DIR, "mods"));
    for (const m of mods) {
      expect(m.manifest.id).toBeTruthy();
      expect(m.manifest.version).toBeTruthy();
      expect(Array.isArray(m.manifest.dependencies)).toBe(true);
    }
  });

  it("applyMods merges NPC overrides into base data", async () => {
    const base = await loadStaticData(DATA_DIR);
    const baseSize = base.npcTemplates.size;
    const mods = loadMods(join(DATA_DIR, "mods"));
    const merged = applyMods(base, mods);
    expect(merged.npcTemplates.size).toBeGreaterThan(baseSize);
    expect(merged.npcTemplates.has("giac_master")).toBe(true);
  });

  it("applyMods does not mutate base", async () => {
    const base = await loadStaticData(DATA_DIR);
    const before = base.npcTemplates.size;
    const mods = loadMods(join(DATA_DIR, "mods"));
    applyMods(base, mods);
    expect(base.npcTemplates.size).toBe(before);
  });

  it("validateModDependencies returns empty for example mod", () => {
    const mods = loadMods(join(DATA_DIR, "mods"));
    const missing = validateModDependencies(mods);
    expect(missing).toEqual([]);
  });

  it("validateModDependencies detects missing", () => {
    const fakeMod = {
      manifest: { id: "fake", name: "x", version: "0.0.1", dependencies: ["nonexistent"] },
      files: {},
      path: "/fake",
    };
    const missing = validateModDependencies([fakeMod]);
    expect(missing.length).toBe(1);
    expect(missing[0]).toContain("nonexistent");
  });

  it("topoSortMods orders by dependencies", () => {
    const a = { manifest: { id: "a", name: "a", version: "1", dependencies: [] }, files: {}, path: "" };
    const b = { manifest: { id: "b", name: "b", version: "1", dependencies: ["a"] }, files: {}, path: "" };
    const c = { manifest: { id: "c", name: "c", version: "1", dependencies: ["b"] }, files: {}, path: "" };
    const sorted = topoSortMods([c, a, b]);
    const ids = sorted.map((m) => m.manifest.id);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("c"));
  });

  it("loadMods returns empty array for nonexistent dir", () => {
    const mods = loadMods("/path/that/does/not/exist");
    expect(mods).toEqual([]);
  });
});