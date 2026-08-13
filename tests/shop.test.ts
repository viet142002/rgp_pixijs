import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStaticData } from "../engine/data/loader.js";
import { createEngine } from "../engine/engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

describe("Shop System", () => {
  it("listShop returns shop items for NPC with shop def", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70001, data });
    const items = engine.listShop("village_merchant");
    expect(items.length).toBeGreaterThan(0);
  });

  it("rep-gated items hidden when rep below threshold", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70002, data });
    engine.state.player.factionRep["village_council"] = 0;
    const items = engine.listShop("village_merchant");
    // jade_blade requires minRep 30 — should be hidden
    const itemIds = items.map((i) => i.itemId);
    expect(itemIds).toContain("iron_sword");
    expect(itemIds).not.toContain("jade_blade");
  });

  it("rep-gated items shown when rep meets threshold", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70003, data });
    engine.state.player.factionRep["village_council"] = 50;
    const items = engine.listShop("village_merchant");
    const itemIds = items.map((i) => i.itemId);
    expect(itemIds).toContain("jade_blade");
  });

  it("buyItem deducts gold and adds to inventory", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70004, data });
    const goldBefore = engine.getPlayer().gold;
    const result = engine.buyItem("village_merchant", "hp_potion_small", 3);
    expect(result.success).toBe(true);
    expect(engine.getPlayer().gold).toBeLessThan(goldBefore);
    expect(engine.countItem("hp_potion_small")).toBeGreaterThan(3);
  });

  it("buyItem fails when not enough gold", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70005, data });
    engine.state.player.gold = 5;
    const result = engine.buyItem("village_merchant", "spirit_sword", 1);
    expect(result.success).toBe(false);
  });

  it("buyItem applies faction discount when high rep", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70006, data });
    engine.state.player.factionRep["village_council"] = 0;
    const basePrice = engine.getBuyPrice("village_merchant", "hp_potion_small");
    engine.state.player.factionRep["village_council"] = 100;
    const discountedPrice = engine.getBuyPrice("village_merchant", "hp_potion_small");
    expect(discountedPrice).toBeLessThanOrEqual(basePrice);
  });

  it("sellItem adds gold, removes from inventory", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70007, data });
    engine.giveItem("spirit_herb", 10);
    const goldBefore = engine.getPlayer().gold;
    const herbsBefore = engine.countItem("spirit_herb");
    const result = engine.sellItem("village_merchant", "spirit_herb", 3);
    expect(result.success).toBe(true);
    expect(engine.countItem("spirit_herb")).toBe(herbsBefore - 3);
    expect(engine.getPlayer().gold).toBeGreaterThan(goldBefore);
  });

  it("sellItem rejects quest items", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70008, data });
    engine.giveItem("bandit_letter", 1);
    const result = engine.sellItem("village_merchant", "bandit_letter", 1);
    expect(result.success).toBe(false);
  });

  it("listShop returns empty for NPC without shop def", async () => {
    const data = await loadStaticData(DATA_DIR);
    const engine = createEngine({ seed: 70009, data });
    const items = engine.listShop("wanderer");
    expect(items).toEqual([]);
  });
});
