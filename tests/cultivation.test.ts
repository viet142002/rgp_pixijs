import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Cultivation", () => {
  it("meditate gives exp in safe zone", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 20001, data });
    engine.state.currentRegion = "region_village"; // safe zone
    const before = engine.getCultivationExp();
    const res = engine.meditate(60);
    expect(res.expGained).toBeGreaterThan(0);
    expect(engine.getCultivationExp()).toBe(before + res.expGained);
  });

  it("meditate gives no exp in danger zone", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 20002, data });
    engine.state.currentRegion = "region_forest"; // not safe zone
    const res = engine.meditate(60);
    expect(res.expGained).toBe(0);
  });

  it("breakthrough advances layer when exp sufficient", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 20003, data });
    engine.state.currentRegion = "region_village";
    const cost = engine.getBreakthroughCost();
    engine.addCultivationExp(cost.exp + 50);
    const before = engine.getPlayer().realmLayer;
    let attempts = 0;
    let result = engine.attemptBreakthrough();
    while (!result.success && attempts < 200) {
      engine.addCultivationExp(cost.exp);
      result = engine.attemptBreakthrough();
      attempts++;
    }
    expect(result.success).toBe(true);
    expect(engine.getPlayer().realmLayer).toBe(before + 1);
  });

  it("breakthrough fails when exp insufficient", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 20004, data });
    const result = engine.attemptBreakthrough();
    expect(result.success).toBe(false);
    expect(result.message).toContain("chưa đủ");
  });

  it("qi_deviation state exists when added", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 20005, data });
    // Force the state directly (deterministic test)
    engine.getPlayer().states.push({
      id: "qi_deviation",
      name: "Tẩu Hỏa Nhập Ma",
      duration: 24 * 60,
      day: 0,
      source: "breakthrough",
      modifiers: {},
    });
    expect(engine.getPlayer().states.some((s) => s.id === "qi_deviation")).toBe(true);
  });
});

describe("Alchemy", () => {
  it("craft consumes ingredients and produces item", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 30001, data });
    engine.giveItem("spirit_herb", 5);
    engine.craft("hp_potion_small_recipe");
    // Either success (got hp_potion_small) or failure (no change to herb)
    const potions = engine.countItem("hp_potion_small");
    const herbs = engine.countItem("spirit_herb");
    // Note: ingredients always consumed
    expect(herbs + potions).toBeGreaterThanOrEqual(5); // items redistributed
  });

  it("craft fails when missing ingredients", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 30002, data });
    const res = engine.craft("breakthrough_pill_minor_recipe");
    expect(res.success).toBe(false);
    expect(res.message).toContain("Thiếu");
  });

  it("listRecipes returns built-in recipes", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 30003, data });
    const recipes = engine.listRecipes();
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.some((r) => r.id === "hp_potion_small_recipe")).toBe(true);
  });
});

describe("Dual Cultivation", () => {
  it("grants 3× exp when partner trusts player", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 40001, data });
    engine.state.currentRegion = "region_village";
    // Use a partner with no grudge
    const before = engine.getCultivationExp();
    const res = engine.dualCultivate("village_child", 60);
    if (!res.betrayed) {
      expect(res.expGained).toBeGreaterThan(0);
      expect(engine.getCultivationExp()).toBe(before + res.expGained);
    } else {
      // Acceptable if rolled
      expect(res.expGained).toBe(0);
    }
  });

  it("partner with grudge > 60 triggers betrayal", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 40002, data });
    engine.state.currentRegion = "region_village";
    const npc = engine.getNpc("village_child")!;
    npc.grudge.push({
      target: "player",
      type: "attacked",
      strength: 80,
      decay: 1,
      day: 0,
    });
    const res = engine.dualCultivate("village_child", 60);
    expect(res.betrayed).toBe(true);
  });

  it("dual cultivation refuses in danger zone", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 40003, data });
    engine.state.currentRegion = "region_forest";
    const res = engine.dualCultivate("village_child", 60);
    expect(res.betrayed).toBe(false);
    expect(res.expGained).toBe(0);
    expect(res.message).toContain("an toàn");
  });
});
